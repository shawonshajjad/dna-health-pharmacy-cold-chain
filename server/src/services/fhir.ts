const base = () => process.env.FHIR_BASE_URL || "https://hapi.fhir.org/baseR4";
const headers = {
  "Content-Type": "application/fhir+json",
  Accept: "application/fhir+json",
};

export async function getMedicationRequest(id: string) {
  if (!id) throw new Error("FHIR MedicationRequest ID is required");
  if (process.env.USE_MOCK_FHIR === "true")
    return {
      resourceType: "MedicationRequest",
      id,
      status: "active",
      intent: "order",
      medicationCodeableConcept: {
        coding: [
          {
            system: "http://www.nlm.nih.gov/research/umls/rxnorm",
            code: "1807513",
            display: "vancomycin 1000 MG Injection",
          },
        ],
        text: "Vancomycin 1 g Injection",
      },
      subject: { reference: "Patient/example" },
      dosageInstruction: [
        {
          text: "1 g IV every 12 hours",
          timing: { repeat: { frequency: 1, period: 12, periodUnit: "h" } },
          route: { text: "IV" },
          doseAndRate: [
            {
              doseQuantity: {
                value: 1,
                unit: "g",
                system: "http://unitsofmeasure.org",
                code: "g",
              },
            },
          ],
        },
      ],
    };
  const r = await fetch(
    `${base()}/MedicationRequest/${encodeURIComponent(id)}`,
    { headers: { Accept: "application/fhir+json" } },
  );
  if (!r.ok)
    throw new Error(`FHIR MedicationRequest read failed (${r.status})`);
  const resource: any = await r.json();
  if (resource?.resourceType !== "MedicationRequest")
    throw new Error("FHIR server did not return a MedicationRequest");
  return resource;
}

export async function listActiveMedicationRequests(patientFhirId: string) {
  if (!patientFhirId)
    throw new Error("Patient is not linked to a FHIR Patient resource");
  if (process.env.USE_MOCK_FHIR === "true")
    return [await getMedicationRequest(`mock-medrx-${patientFhirId}`)];
  const url = new URL(`${base()}/MedicationRequest`);
  url.searchParams.set("patient", patientFhirId);
  url.searchParams.set("status", "active");
  url.searchParams.set("_sort", "-_lastUpdated");
  url.searchParams.set("_count", "50");
  const r = await fetch(url, { headers: { Accept: "application/fhir+json" } });
  if (!r.ok)
    throw new Error(`FHIR MedicationRequest search failed (${r.status})`);
  const bundle: any = await r.json();
  return (bundle?.entry || [])
    .map((e: any) => e.resource)
    .filter((x: any) => x?.resourceType === "MedicationRequest" && x?.id);
}

export function medicationRequestSummary(fhir: any) {
  const coding = (fhir?.medicationCodeableConcept?.coding || []).find(
    (c: any) =>
      String(c.system || "")
        .toLowerCase()
        .includes("rxnorm"),
  );
  const dosage = fhir?.dosageInstruction?.[0];
  const doseQuantity = dosage?.doseAndRate?.[0]?.doseQuantity;
  const display = String(
    coding?.display || fhir?.medicationCodeableConcept?.text || "Medication",
  ).trim();
  const strengthMatch = display.match(
    /\b(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml|unit(?:s)?)\b/i,
  );
  return {
    id: String(fhir?.id || ""),
    status: String(fhir?.status || ""),
    medicationName: display,
    rxnormRxcui: coding?.code ? String(coding.code) : "",
    strength: strengthMatch ? `${strengthMatch[1]} ${strengthMatch[2]}` : "",
    dose: String(
      dosage?.text ||
        [doseQuantity?.value, doseQuantity?.unit || doseQuantity?.code]
          .filter(Boolean)
          .join(" ") ||
        "",
    ),
    route: String(
      dosage?.route?.text ||
        dosage?.route?.coding?.[0]?.display ||
        dosage?.route?.coding?.[0]?.code ||
        "",
    ),
    subjectReference: String(fhir?.subject?.reference || ""),
  };
}

export function verifyDoseAgainstPrescription(
  requestedDose: string,
  fhir: any,
) {
  const instruction = fhir?.dosageInstruction?.[0];
  const q = instruction?.doseAndRate?.[0]?.doseQuantity;
  const repeat = instruction?.timing?.repeat;
  const sourceText = instruction?.text || null;
  const normalizeUnit = (u: string = "") =>
    u
      .toLowerCase()
      .replace("milligrams", "mg")
      .replace("milligram", "mg")
      .replace("grams", "g")
      .replace("gram", "g");
  const toMg = (value: number, unit: string) =>
    normalizeUnit(unit) === "g"
      ? value * 1000
      : normalizeUnit(unit) === "mg"
        ? value
        : null;
  const m = requestedDose.trim().match(/(\d+(?:\.\d+)?)\s*(mg|g)\b/i);
  if (!q || !m)
    return {
      valid: false,
      requested: requestedDose,
      prescribed: sourceText,
      requestedMg: null,
      prescribedMg: null,
      reason: "Structured dose could not be compared",
    };
  const requestedMg = toMg(Number(m[1]), m[2]);
  const prescribedMg = toMg(Number(q.value), String(q.code || q.unit || ""));
  const intervalMatch = requestedDose.match(
    /every\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i,
  );
  const prescribedHours =
    repeat?.periodUnit === "h" ? Number(repeat.period) : null;
  const amountMatches =
    requestedMg !== null &&
    prescribedMg !== null &&
    requestedMg === prescribedMg;
  const intervalMatches =
    !intervalMatch ||
    prescribedHours === null ||
    Number(intervalMatch[1]) === prescribedHours;
  const valid = amountMatches && intervalMatches;
  return {
    valid,
    requested: requestedDose,
    prescribed: sourceText,
    requestedMg,
    prescribedMg,
    amountMatches,
    intervalMatches,
    reason: valid
      ? "Dose matches source prescription"
      : "Dose differs from source prescription",
  };
}

export async function createDispense(req: any) {
  const eta = req.eta ? new Date(req.eta).toISOString() : null;
  const resource: any = {
    resourceType: "MedicationDispense",
    status: "in-progress",
    medicationCodeableConcept: {
      coding: req.rxnormRxcui
        ? [
            {
              system: "http://www.nlm.nih.gov/research/umls/rxnorm",
              code: req.rxnormRxcui,
            },
          ]
        : undefined,
      text: `${req.medicationName} ${req.strength || ""}`.trim(),
    },
    subject: {
      reference: `Patient/${req.patient.fhirPatientId || req.patient.mrn}`,
    },
    authorizingPrescription: req.fhirMedicationRequestId
      ? [{ reference: `MedicationRequest/${req.fhirMedicationRequestId}` }]
      : [],
    quantity: { value: req.quantity, unit: "dose" },
    whenPrepared: req.packedAt
      ? new Date(req.packedAt).toISOString()
      : undefined,
    whenHandedOver: req.dispatchedAt
      ? new Date(req.dispatchedAt).toISOString()
      : undefined,
    performer: req.courierName
      ? [
          {
            actor: { display: req.courierName },
            function: { text: "Medication courier" },
          },
        ]
      : undefined,
    extension: eta
      ? [
          {
            url: "https://dna-health.example/fhir/StructureDefinition/delivery-eta",
            valueDateTime: eta,
          },
        ]
      : undefined,
    note: [
      {
        text: "Cold-chain package prepared for controlled inpatient delivery.",
      },
    ],
  };
  if (process.env.USE_MOCK_FHIR === "true")
    return {
      ...resource,
      id: `disp-${req.id}`,
      meta: { tag: [{ code: "mock" }] },
    };
  const r = await fetch(`${base()}/MedicationDispense`, {
    method: "POST",
    headers,
    body: JSON.stringify(resource),
  });
  if (!r.ok)
    throw new Error(
      `FHIR MedicationDispense write failed: ${r.status} ${await r.text()}`,
    );
  return r.json();
}

export function makeAuditEvent(
  action: string,
  requestId: string,
  actor: string,
) {
  return {
    resourceType: "AuditEvent",
    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
    },
    action: "E",
    recorded: new Date().toISOString(),
    agent: [{ requestor: true, who: { display: actor } }],
    source: { observer: { display: "DNA Pharmacy Gateway" } },
    entity: [
      {
        what: { reference: `MedicationRequest/${requestId}` },
        detail: [{ type: "action", valueString: action }],
      },
    ],
  };
}

export async function writeAuditEvent(
  action: string,
  requestId: string,
  actor: string,
) {
  const resource = makeAuditEvent(action, requestId, actor);
  if (process.env.USE_MOCK_FHIR === "true")
    return {
      ...resource,
      id: `audit-${Date.now()}`,
      meta: { tag: [{ code: "mock" }] },
    };
  const r = await fetch(`${base()}/AuditEvent`, {
    method: "POST",
    headers,
    body: JSON.stringify(resource),
  });
  if (!r.ok)
    throw new Error(
      `FHIR AuditEvent write failed: ${r.status} ${await r.text()}`,
    );
  return r.json();
}

export async function findMedicationRequest(
  patientFhirId: string,
  rxcui: string,
) {
  const requests = await listActiveMedicationRequests(patientFhirId);
  const exact = requests.find((mr: any) =>
    mr?.medicationCodeableConcept?.coding?.some(
      (c: any) =>
        String(c.system || "")
          .toLowerCase()
          .includes("rxnorm") && String(c.code) === String(rxcui),
    ),
  );
  if (!exact?.id)
    throw new Error(
      "No active FHIR MedicationRequest matches this patient and RxNorm medication",
    );
  return String(exact.id);
}

/**
 * Write a FHIR AuditEvent for an inbound HL7 v2 message.
 *
 * HL7 ORC-2 contains a local placer/order identifier such as REQ-1007.
 * It is NOT necessarily a FHIR MedicationRequest resource ID.
 *
 * Therefore this AuditEvent records the HL7 order as an Identifier
 * instead of creating an invalid MedicationRequest/{orderId} reference.
 */
export async function writeHl7AuditEvent(
  action: string,
  orderId: string,
  actor: string,
) {
  const resource: any = {
    resourceType: "AuditEvent",

    type: {
      system: "http://terminology.hl7.org/CodeSystem/audit-event-type",
      code: "rest",
      display: "Restful Operation",
    },

    subtype: [
      {
        system: "http://terminology.hl7.org/CodeSystem/restful-interaction",
        code: "create",
        display: "create",
      },
    ],

    action: "C",

    recorded: new Date().toISOString(),

    outcome: "0",

    agent: [
      {
        requestor: true,
        who: {
          display: actor,
        },
      },
    ],

    source: {
      observer: {
        display: "DNA Pharmacy Gateway",
      },
    },

    entity: [
      {
        what: {
          identifier: {
            system: "https://dna-health.example/identifier/hl7-placer-order",
            value: orderId,
          },

          display: `HL7 OMP^O09 order ${orderId}`,
        },

        detail: [
          {
            type: "action",
            valueString: action,
          },
          {
            type: "message-type",
            valueString: "OMP^O09",
          },
        ],
      },
    ],
  };

  if (process.env.USE_MOCK_FHIR === "true") {
    return {
      ...resource,
      id: `audit-hl7-${Date.now()}`,
      meta: {
        tag: [{ code: "mock" }],
      },
    };
  }

  const response = await fetch(`${base()}/AuditEvent`, {
    method: "POST",
    headers,
    body: JSON.stringify(resource),
  });

  if (!response.ok) {
    throw new Error(
      `FHIR HL7 AuditEvent write failed: ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}
