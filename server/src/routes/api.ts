import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Role, RequestStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { auth, allow } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import {
  getMedicationRequest,
  listActiveMedicationRequests,
  medicationRequestSummary,
  verifyDoseAgainstPrescription,
  createDispense,
  writeAuditEvent,
  writeHl7AuditEvent,
} from "../services/fhir.js";
import {
  validateRxCui,
  searchRxNorm,
  getRxNormConceptName,
} from "../services/rxnav.js";
import { parseOMP } from "../services/hl7.js";
import {
  notifyNurse,
  notifyPharmacistsNewRequest,
} from "../services/notification.js";

const r = Router();
r.use(auth);

r.get("/me", (req, res) => res.json(req.user));
r.get("/patients", allow(Role.NURSE), async (_, res) =>
  res.json(await prisma.patient.findMany({ select: { id:true, mrn:true, displayName:true, ward:true, room:true, fhirPatientId:true }, orderBy: { mrn: "asc" } })),
);
r.get("/inventory", allow(Role.PHARMACIST), async (_, res) =>
  res.json(
    await prisma.inventory.findMany({ orderBy: { medicationName: "asc" } }),
  ),
);
r.get("/medications/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    res.json(await searchRxNorm(q));
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "RxNorm search unavailable" });
  }
});

// Nurse UI: load the selected patient's active doctor prescriptions from live FHIR.
r.get("/patients/:id/prescriptions", allow(Role.NURSE), async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: +req.params.id },
  });
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!patient.fhirPatientId)
    return res
      .status(422)
      .json({ error: "Patient is not linked to a FHIR Patient resource" });
  try {
    const resources = await listActiveMedicationRequests(patient.fhirPatientId);
    const summaries = await Promise.all(
      resources.map(async (mr: any) => {
        const s = medicationRequestSummary(mr);
        const officialName = s.rxnormRxcui
          ? await getRxNormConceptName(s.rxnormRxcui)
          : null;
        return {
          ...s,
          medicationName: officialName || s.medicationName,
          rxnormValidated: Boolean(officialName),
        };
      }),
    );
    res.json(summaries.filter((x) => x.id && x.rxnormRxcui));
  } catch (e: any) {
    res.status(502).json({
      error: e?.message || "Unable to read active prescriptions from FHIR",
    });
  }
});

r.get("/requests", async (req, res) => {
  const where =
    req.user!.role === Role.NURSE ? { requestedById: req.user!.id } : {};
  res.json(
    await prisma.medicationRequest.findMany({
      where,
      include: {
        patient: true,
        requestedBy: { select: { name: true } },
        processedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
});

// Nurse submits only the selected FHIR prescription + operational indent data.
// Clinical drug/dose/route values are re-read from FHIR on the server; they are not trusted from the browser.
r.post("/requests", allow(Role.NURSE), async (req, res) => {
  const x = z
    .object({
      patientId: z.number(),
      fhirMedicationRequestId: z.string().min(1),
      quantity: z.number().int().positive(),
      priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    })
    .safeParse(req.body);
  if (!x.success) return res.status(400).json({ error: x.error.flatten() });
  const patient = await prisma.patient.findUnique({
    where: { id: x.data.patientId },
  });
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!patient.fhirPatientId)
    return res
      .status(422)
      .json({ error: "Patient is not linked to a FHIR Patient resource" });
  try {
    const fhir: any = await getMedicationRequest(
      x.data.fhirMedicationRequestId,
    );
    if (String(fhir?.status || "") !== "active")
      return res
        .status(422)
        .json({ error: "The selected FHIR prescription is not active" });
    const subject = String(fhir?.subject?.reference || "");
    if (
      subject !== `Patient/${patient.fhirPatientId}` &&
      !subject.endsWith(`/Patient/${patient.fhirPatientId}`)
    )
      return res.status(422).json({
        error: "The selected prescription does not belong to this patient",
      });
    const s = medicationRequestSummary(fhir);
    if (!s.rxnormRxcui)
      return res.status(422).json({
        error: "The FHIR prescription does not contain an RxNorm RxCUI",
      });
    const rx = await validateRxCui(s.rxnormRxcui, s.rxnormRxcui);
    if (!rx.valid)
      return res.status(422).json({
        error:
          rx.error || "RxNorm could not validate the prescription medication",
      });
    const requestNo = `REQ-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const row = await prisma.medicationRequest.create({
      data: {
        patientId: patient.id,
        medicationName: rx.matchedName || s.medicationName,
        rxnormRxcui: s.rxnormRxcui,
        strength: s.strength || undefined,
        dose: s.dose || "See FHIR prescription",
        route: s.route || undefined,
        quantity: x.data.quantity,
        priority: x.data.priority,
        fhirMedicationRequestId: s.id,
        requestNo,
        requestedById: req.user!.id,
      },
    });
    await Promise.all([
      audit(
        req.user!.id,
        "CREATE_REQUEST",
        "MedicationRequest",
        String(row.id),
        { requestNo: row.requestNo, fhirId: s.id, rxnormRxcui: s.rxnormRxcui },
      ),
      notifyPharmacistsNewRequest(row.id, row.requestNo, row.priority),
    ]);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(502).json({
      error:
        e?.message || "Unable to create request from the FHIR prescription",
    });
  }
});

r.get("/requests/:id", async (req, res) => {
  const row = await prisma.medicationRequest.findUnique({
    where: { id: +req.params.id },
    include: {
      patient: true,
      requestedBy: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
    },
  });
  if (!row) return res.status(404).json({ error: "Not found" });
  if (req.user!.role === Role.NURSE && row.requestedById !== req.user!.id)
    return res.status(403).json({ error: "Forbidden" });
  res.json(row);
});

r.post("/requests/:id/verify", allow(Role.PHARMACIST), async (req, res) => {
  const row = await prisma.medicationRequest.findUnique({
    where: { id: +req.params.id },
    include: { patient: true },
  });
  if (!row) return res.status(404).json({ error: "Not found" });
  try {
    if (!row.fhirMedicationRequestId)
      return res
        .status(400)
        .json({ error: "FHIR MedicationRequest ID is required" });
    const fhir: any = await getMedicationRequest(row.fhirMedicationRequestId);
    const summary = medicationRequestSummary(fhir);
    const expected = summary.rxnormRxcui || null;
    const selectedCodeMatches = Boolean(
      row.rxnormRxcui &&
      expected &&
      String(row.rxnormRxcui) === String(expected),
    );
    // Live RxNav call validates the actual RxCUI instead of fuzzy-matching a constructed drug-name string.
    const rx = await validateRxCui(String(row.rxnormRxcui || ""), expected);
    const doseCheck = verifyDoseAgainstPrescription(row.dose, fhir);
    const clinicallyVerified =
      rx.valid &&
      selectedCodeMatches &&
      doseCheck.valid &&
      String(fhir?.status || "") === "active";
    const updated = await prisma.medicationRequest.update({
      where: { id: row.id },
      data: {
        status: clinicallyVerified
          ? RequestStatus.VERIFIED
          : RequestStatus.VERIFYING,
        processedById: req.user!.id,
        rxnormValidated: rx.valid,
      },
    });
    await Promise.all([
      audit(
        req.user!.id,
        "VERIFY_PRESCRIPTION",
        "MedicationRequest",
        String(row.id),
        {
          fhirId: row.fhirMedicationRequestId,
          expectedRxCui: expected,
          requestedRxCui: row.rxnormRxcui,
          selectedCodeMatches,
          rxnorm: rx,
          doseCheck,
        },
      ),
      writeAuditEvent(
        "VERIFY_PRESCRIPTION",
        row.fhirMedicationRequestId,
        req.user!.name,
      ),
    ]);
    res.json({
      request: updated,
      fhir,
      rxnorm: rx,
      doseCheck,
      selectedCodeMatches,
      clinicallyVerified,
    });
  } catch (e: any) {
    res
      .status(502)
      .json({ error: e?.message || "Prescription verification failed" });
  }
});

r.post("/hl7/omp", allow(Role.PHARMACIST), async (req, res) => {
  try {
    const raw =
      typeof req.body === "string" ? req.body : String(req.body?.message || "");
    const parsed = parseOMP(raw);
    await Promise.all([
      audit(
        req.user!.id,
        "INGEST_HL7_OMP",
        "HL7",
        String(parsed.orderId || "unknown"),
        {
          messageType: parsed.messageType,
          patientId: parsed.patientId,
          medication: parsed.medication,
        },
      ),
      writeHl7AuditEvent(
        "INGEST_HL7_OMP",
        String(parsed.orderId || "unknown"),
        req.user!.name,
      ),
    ]);
    res.json(parsed);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

r.patch("/requests/:id/status", allow(Role.PHARMACIST), async (req, res) => {
  const x = z
    .object({
      status: z.enum(["PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "REJECTED"]),
      courierName: z.string().min(2).optional(),
      eta: z.string().datetime().optional(),
    })
    .safeParse(req.body);
  if (!x.success) return res.status(400).json({ error: x.error.flatten() });
  const old = await prisma.medicationRequest.findUnique({
    where: { id: +req.params.id },
    include: { patient: true },
  });
  if (!old) return res.status(404).json({ error: "Not found" });
  if (
    x.data.status === "OUT_FOR_DELIVERY" &&
    (!x.data.courierName || !x.data.eta)
  )
    return res
      .status(400)
      .json({ error: "Courier and ETA are required for dispatch" });
  const allowed: any = {
    VERIFIED: ["PACKED"],
    PACKED: ["OUT_FOR_DELIVERY"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    REQUESTED: ["REJECTED"],
    VERIFYING: ["REJECTED"],
    VERIFIED_REJECT: ["REJECTED"],
  };
  if (
    x.data.status !== "REJECTED" &&
    !(allowed[old.status] || []).includes(x.data.status)
  )
    return res.status(409).json({
      error: `Invalid status transition: ${old.status} → ${x.data.status}`,
    });
  const now = new Date();
  const data: any = {
    status: x.data.status,
    processedById: req.user!.id,
    courierName: x.data.courierName ?? old.courierName,
    eta: x.data.eta ? new Date(x.data.eta) : old.eta,
  };
  if (x.data.status === "PACKED") data.packedAt = now;
  if (x.data.status === "OUT_FOR_DELIVERY") data.dispatchedAt = now;
  if (x.data.status === "DELIVERED") data.deliveredAt = now;
  const row = await prisma.medicationRequest.update({
    where: { id: old.id },
    data,
    include: { patient: true },
  });
  let medicationDispense: any = null;
  if (x.data.status === "OUT_FOR_DELIVERY")
    medicationDispense = await createDispense(row);
  const [notification, , auditEvent] = await Promise.all([
    notifyNurse(
      row.requestedById,
      row.id,
      x.data.status,
      row.eta,
      row.courierName,
    ),
    audit(
      req.user!.id,
      `STATUS_${x.data.status}`,
      "MedicationRequest",
      String(row.id),
      {
        requestNo: row.requestNo,
        courier: row.courierName,
        eta: row.eta,
        dispenseId: medicationDispense?.id || null,
      },
    ),
    writeAuditEvent(
      `STATUS_${x.data.status}`,
      row.fhirMedicationRequestId || String(row.id),
      req.user!.name,
    ),
  ]);
  res.json({ request: row, medicationDispense, auditEvent, notification });
});

r.get("/notifications", async (req, res) =>
  res.json(
    await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
r.patch("/notifications/:id/read", async (req, res) => {
  const note = await prisma.notification.findFirst({
    where: { id: +req.params.id, userId: req.user!.id },
  });
  if (!note) return res.status(404).json({ error: "Notification not found" });
  res.json(
    await prisma.notification.update({
      where: { id: note.id },
      data: { read: true },
    }),
  );
});
r.get("/audits", allow(Role.PHARMACIST), async (_, res) =>
  res.json(
    await prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 100 }),
  ),
);
export default r;
