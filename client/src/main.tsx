import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ClipboardPlus,
  Bell,
  Package,
  LogOut,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Search,
  FlaskConical,
  FileCheck2,
  Boxes,
} from "lucide-react";
import "./style.css";
const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(
  /\/$/,
  "",
);
type User = {
  id: number;
  name: string;
  email: string;
  role: "NURSE" | "PHARMACIST";
  ward?: string;
};
type Req = {
  id: number;
  requestNo: string;
  medicationName: string;
  strength?: string;
  dose: string;
  route?: string;
  quantity: number;
  priority: string;
  status: string;
  courierName?: string;
  eta?: string;
  rxnormValidated: boolean;
  rxnormRxcui?: string;
  patient: { mrn: string; displayName: string; ward: string; room?: string };
  requestedBy?: { name: string };
};
async function call(path: string, token: string, options: any = {}) {
  const r = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(j.error ? JSON.stringify(j.error) : "Request failed");
  return j;
}
function Login({ done }: { done: (t: string, u: User) => void }) {
  const [email, setEmail] = useState("nurse@dna.test"),
    [password, setPassword] = useState("Demo123!"),
    [err, setErr] = useState("");
  async function submit(e: any) {
    e.preventDefault();
    try {
      const j = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json());
      if (!j.token) throw new Error(j.error);
      done(j.token, j.user);
    } catch (e: any) {
      setErr(e.message);
    }
  }
  return (
    <div className="login">
      <div className="loginCard">
        <div className="brand">
          <span className="logo">✣</span>
          <b>DNA Health</b>
        </div>
        <h1>Welcome Back</h1>
        <p>Hospital Pharmacy Cold Chain & Delivery</p>
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <div className="error">{err}</div>}
          <button>Sign in</button>
        </form>
        <div className="demo">
          <b>Demo accounts</b>
          <span onClick={() => setEmail("nurse@dna.test")}>
            Nurse: nurse@dna.test
          </span>
          <span onClick={() => setEmail("pharmacist@dna.test")}>
            Pharmacist: pharmacist@dna.test
          </span>
          <small>Password: Demo123!</small>
        </div>
      </div>
      <div className="hero">
        <div>
          <ShieldCheck size={48} />
          <h2>
            Safe Medicine.
            <br />
            Connected Care.
          </h2>
          <p>
            FHIR prescription verification, RxNorm validation, HL7
            interoperability and PHI-safe delivery alerts.
          </p>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [token, setToken] = useState(""),
    [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("dashboard"),
    [requests, setRequests] = useState<Req[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [focusRequestId, setFocusRequestId] = useState<number | null>(null);
  const load = async () => {
    if (!token) return;
    setRequests(await call("/api/requests", token));
    setNotes(await call("/api/notifications", token));
  };
  useEffect(() => {
    load();
  }, [token, page]);
  if (!token || !user)
    return (
      <Login
        done={(t, u) => {
          setToken(t);
          setUser(u);
        }}
      />
    );
  const logout = () => {
    setToken("");
    setUser(null);
    setFocusRequestId(null);
  };
  async function openNotification(n: any) {
    try {
      if (!n.read)
        await call(`/api/notifications/${n.id}/read`, token, {
          method: "PATCH",
        });
      setFocusRequestId(Number(n.requestId) || null);
      setPage("requests");
      await load();
    } catch (e) {
      console.error(e);
    }
  }
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span className="logo">✣</span>
          <b>DNA Health</b>
        </div>
        <nav>
          <Nav
            icon={<LayoutDashboard />}
            text="Dashboard"
            active={page === "dashboard"}
            go={() => setPage("dashboard")}
          />
          {user.role === "NURSE" && (
            <Nav
              icon={<ClipboardPlus />}
              text="New Request"
              active={page === "new"}
              go={() => setPage("new")}
            />
          )}
          <Nav
            icon={<Package />}
            text={user.role === "NURSE" ? "My Requests" : "Pharmacy Console"}
            active={page === "requests"}
            go={() => setPage("requests")}
          />
          <Nav
            icon={<Bell />}
            text="Notifications"
            active={page === "notifications"}
            go={() => setPage("notifications")}
            badge={notes.filter((n) => !n.read).length}
          />
          {user.role === "PHARMACIST" && (
            <>
              <Nav
                icon={<Boxes />}
                text="Inventory"
                active={page === "inventory"}
                go={() => setPage("inventory")}
              />
              <Nav
                icon={<FileCheck2 />}
                text="Audit Trail"
                active={page === "audit"}
                go={() => setPage("audit")}
              />
            </>
          )}
        </nav>
        <button className="logout" onClick={logout}>
          <LogOut /> Sign out
        </button>
      </aside>
      <main>
        <header>
          <div>
            <h2>{title(page, user.role)}</h2>
            <p>
              {user.role === "NURSE"
                ? user.ward || "Nursing"
                : "Central Pharmacy"}
            </p>
          </div>
          <div className="profile">
            <span>{user.name}</span>
            <b>{user.role}</b>
          </div>
        </header>
        {page === "dashboard" && (
          <Dashboard requests={requests} role={user.role} />
        )}{" "}
        {page === "new" && (
          <NewRequest
            token={token}
            done={() => {
              setPage("requests");
              load();
            }}
          />
        )}
        {page === "requests" && (
          <Requests
            rows={requests}
            role={user.role}
            token={token}
            reload={load}
            focusRequestId={focusRequestId}
            clearFocus={() => setFocusRequestId(null)}
          />
        )}{" "}
        {page === "notifications" && (
          <Notifications rows={notes} onOpen={openNotification} />
        )}{" "}
        {page === "inventory" && <Inventory token={token} />}{" "}
        {page === "audit" && <Audit token={token} />}
      </main>
    </div>
  );
}
function Nav(p: any) {
  return (
    <button className={p.active ? "active" : ""} onClick={p.go}>
      {p.icon}
      <span>{p.text}</span>
      {p.badge > 0 && <i>{p.badge}</i>}
    </button>
  );
}
const title = (p: string, r: string) =>
  p === "new"
    ? "New Medication Request"
    : p === "requests"
      ? r === "NURSE"
        ? "My Requests"
        : "Pharmacy Console"
      : p === "notifications"
        ? "Notifications"
        : p === "inventory"
          ? "Cold-chain Inventory"
          : p === "audit"
            ? "Tamper-evident Audit Trail"
            : "Dashboard";
function Dashboard({ requests, role }: { requests: Req[]; role: string }) {
  const count = (s: string) => requests.filter((r) => r.status === s).length;
  return (
    <>
      <div className="cards">
        <Card
          n={requests.length}
          label={role === "NURSE" ? "My Requests" : "Incoming / Total"}
          icon={<ClipboardPlus />}
        />
        <Card
          n={count("VERIFIED") + count("PACKED")}
          label="In Pharmacy"
          icon={<Package />}
        />
        <Card
          n={count("OUT_FOR_DELIVERY")}
          label="Out for Delivery"
          icon={<Truck />}
        />
        <Card
          n={count("DELIVERED")}
          label="Delivered"
          icon={<CheckCircle2 />}
        />
      </div>
      <section>
        <div className="sectionTitle">
          <div>
            <h3>Recent medication requests</h3>
            <p>Live dispensing and delivery status</p>
          </div>
          <Search />
        </div>
        <Table rows={requests.slice(0, 7)} />
      </section>
    </>
  );
}
function Card({ n, label, icon }: any) {
  return (
    <div className="card">
      <span>{icon}</span>
      <div>
        <b>{n}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}
function Table({ rows, actions }: any) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Patient</th>
            <th>Medication</th>
            <th>Priority</th>
            <th>Status</th>
            <th>ETA</th>
            {actions && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: Req) => (
            <tr key={r.id}>
              <td>
                <b>{r.requestNo}</b>
              </td>
              <td>
                {r.patient?.mrn}
                <small>{r.patient?.ward}</small>
              </td>
              <td>
                {r.medicationName}
                <small>
                  {r.strength} · {r.dose}
                </small>
              </td>
              <td>
                <span className={"pill " + r.priority.toLowerCase()}>
                  {r.priority}
                </span>
              </td>
              <td>
                <span className={"status " + r.status.toLowerCase()}>
                  {r.status.replaceAll("_", " ")}
                </span>
              </td>
              <td>
                {r.eta
                  ? new Date(r.eta).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
              {actions && <td>{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No requests yet.</div>}
    </div>
  );
}
function NewRequest({ token, done }: any) {
  const [patients, setPatients] = useState<any[]>([]),
    [patientId, setPatientId] = useState(0),
    [prescriptions, setPrescriptions] = useState<any[]>([]),
    [prescriptionId, setPrescriptionId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [priority, setPriority] = useState("NORMAL"),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  useEffect(() => {
    call("/api/patients", token)
      .then((p: any[]) => {
        setPatients(p);
        if (p[0]) setPatientId(p[0].id);
      })
      .catch((e: any) => setErr(e.message));
  }, [token]);
  useEffect(() => {
    if (!patientId) {
      setPrescriptions([]);
      setPrescriptionId("");
      return;
    }
    setLoading(true);
    setErr("");
    call(`/api/patients/${patientId}/prescriptions`, token)
      .then((rows: any[]) => {
        setPrescriptions(rows);
        setPrescriptionId(rows[0]?.id || "");
      })
      .catch((e: any) => {
        setPrescriptions([]);
        setPrescriptionId("");
        setErr(e.message);
      })
      .finally(() => setLoading(false));
  }, [patientId, token]);
  const selected = prescriptions.find((p) => p.id === prescriptionId) || null;
  async function submit(e: any) {
    e.preventDefault();
    setErr("");
    if (!prescriptionId) {
      setErr("No active FHIR prescription is selected for this patient.");
      return;
    }
    setBusy(true);
    try {
      await call("/api/requests", token, {
        method: "POST",
        body: JSON.stringify({
          patientId,
          fhirMedicationRequestId: prescriptionId,
          quantity,
          priority,
        }),
      });
      done();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Create pharmacy indent</h3>
      <p>
        The patient’s active doctor prescription is read directly from FHIR.
        Medication identity is checked against NIH/NLM RxNorm; the nurse only
        chooses the prescription, quantity and priority.
      </p>
      <form className="requestForm" onSubmit={submit}>
        <label>
          Patient
          <select
            value={patientId}
            onChange={(e) => setPatientId(+e.target.value)}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.mrn} — {p.displayName} — {p.ward}
              </option>
            ))}
          </select>
        </label>
        <label>
          Active doctor prescription
          <select
            value={prescriptionId}
            disabled={loading || !prescriptions.length}
            onChange={(e) => setPrescriptionId(e.target.value)}
          >
            {loading ? (
              <option>Loading from FHIR…</option>
            ) : !prescriptions.length ? (
              <option value="">No active FHIR prescription found</option>
            ) : (
              prescriptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.medicationName}
                </option>
              ))
            )}
          </select>
        </label>
        {selected && (
          <div className="prescriptionCard">
            <div>
              <b>Medication</b>
              <span>{selected.medicationName}</span>
            </div>
            <div>
              <b>RxCUI</b>
              <span>
                {selected.rxnormRxcui}{" "}
                {selected.rxnormValidated ? "✓ RxNorm" : "⚠ Not validated"}
              </span>
            </div>
            <div>
              <b>Strength</b>
              <span>{selected.strength || "—"}</span>
            </div>
            <div>
              <b>Doctor dose</b>
              <span>{selected.dose || "—"}</span>
            </div>
            <div>
              <b>Route</b>
              <span>{selected.route || "—"}</span>
            </div>
            <div>
              <b>FHIR MedicationRequest</b>
              <span>{selected.id}</span>
            </div>
          </div>
        )}
        <label>
          Quantity
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(+e.target.value)}
          />
        </label>
        <label>
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </select>
        </label>
        {err && <div className="error">{err}</div>}
        <div className="formActions">
          <button disabled={busy || loading || !prescriptionId}>
            {busy ? "Submitting…" : "Submit medication request"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Requests({
  rows,
  role,
  token,
  reload,
  focusRequestId,
  clearFocus,
}: any) {
  const [selected, setSelected] = useState<Req | null>(null),
    [verifyResult, setVerifyResult] = useState<any>(null),
    [dispatch, setDispatch] = useState<Req | null>(null),
    [courier, setCourier] = useState("Courier Rahim"),
    [etaMinutes, setEtaMinutes] = useState(35),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!focusRequestId) return;
    const target = rows.find((r: Req) => r.id === focusRequestId);
    if (target) {
      setSelected(target);
      clearFocus?.();
    }
  }, [focusRequestId, rows]);
  async function verify(r: Req) {
    setBusy(true);
    try {
      setVerifyResult(
        await call(`/api/requests/${r.id}/verify`, token, { method: "POST" }),
      );
      await reload();
    } catch (e: any) {
      setVerifyResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function status(r: Req, s: string, extra: any = {}) {
    setBusy(true);
    try {
      await call(`/api/requests/${r.id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: s, ...extra }),
      });
      setDispatch(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  async function doDispatch() {
    if (!dispatch) return;
    await status(dispatch, "OUT_FOR_DELIVERY", {
      courierName: courier,
      eta: new Date(Date.now() + etaMinutes * 60000).toISOString(),
    });
  }
  return (
    <section>
      <div className="sectionTitle">
        <div>
          <h3>
            {role === "NURSE" ? "Medication requests" : "Incoming requests"}
          </h3>
          <p>
            {role === "PHARMACIST"
              ? "Verify FHIR prescription, validate RxNorm, pack and dispatch"
              : "Track each request from pharmacy to ward"}
          </p>
        </div>
      </div>
      <Table
        rows={rows}
        actions={
          role === "PHARMACIST"
            ? (r: Req) => (
                <div className="actions">
                  {["REQUESTED", "VERIFYING"].includes(r.status) && (
                    <button disabled={busy} onClick={() => verify(r)}>
                      <FlaskConical />
                      Verify
                    </button>
                  )}
                  {r.status === "VERIFIED" && (
                    <button disabled={busy} onClick={() => status(r, "PACKED")}>
                      Pack
                    </button>
                  )}
                  {r.status === "PACKED" && (
                    <button disabled={busy} onClick={() => setDispatch(r)}>
                      <Truck />
                      Dispatch
                    </button>
                  )}
                  {r.status === "OUT_FOR_DELIVERY" && (
                    <button
                      disabled={busy}
                      onClick={() => status(r, "DELIVERED")}
                    >
                      <CheckCircle2 />
                      Deliver
                    </button>
                  )}
                  <button className="ghost" onClick={() => setSelected(r)}>
                    View
                  </button>
                </div>
              )
            : undefined
        }
      />
      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setSelected(null)}>
              ×
            </button>
            <h3>{selected.requestNo}</h3>
            <div className="detailGrid">
              <b>Patient</b>
              <span>
                {selected.patient.mrn} / {selected.patient.ward}
              </span>
              <b>Medication</b>
              <span>
                {selected.medicationName} {selected.strength}
              </span>
              <b>Dose</b>
              <span>
                {selected.dose} {selected.route}
              </span>
              <b>RxNorm</b>
              <span>
                {selected.rxnormValidated
                  ? `Validated · ${selected.rxnormRxcui || ""}`
                  : "Pending"}
              </span>
              <b>Status</b>
              <span>{selected.status}</span>
              <b>Courier</b>
              <span>{selected.courierName || "—"}</span>
            </div>
            {role === "PHARMACIST" && (
              <div className="formActions">
                {["REQUESTED", "VERIFYING"].includes(selected.status) && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await verify(selected);
                      setSelected(null);
                    }}
                  >
                    <FlaskConical /> Verify Prescription
                  </button>
                )}
                {selected.status === "VERIFIED" && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await status(selected, "PACKED");
                      setSelected(null);
                    }}
                  >
                    Pack Medication
                  </button>
                )}
                {selected.status === "PACKED" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDispatch(selected);
                      setSelected(null);
                    }}
                  >
                    <Truck /> Dispatch
                  </button>
                )}
                {selected.status === "OUT_FOR_DELIVERY" && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await status(selected, "DELIVERED");
                      setSelected(null);
                    }}
                  >
                    <CheckCircle2 /> Mark Delivered
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {verifyResult && (
        <div className="modal" onClick={() => setVerifyResult(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setVerifyResult(null)}>
              ×
            </button>
            <h3>Prescription Verification</h3>
            {verifyResult.error ? (
              <div className="error">{verifyResult.error}</div>
            ) : (
              <div className="detailGrid">
                <b>FHIR MedicationRequest</b>
                <span>✓ Found</span>
                <b>Prescription</b>
                <span>
                  {verifyResult.fhir?.medicationCodeableConcept?.text || "—"}
                </span>
                <b>Expected RxCUI</b>
                <span>{verifyResult.rxnorm?.expectedRxcui || "—"}</span>
                <b>Resolved RxCUI</b>
                <span>{verifyResult.rxnorm?.rxcui || "—"}</span>
                <b>RxNorm concept</b>
                <span>{verifyResult.rxnorm?.matchedName || "—"}</span>
                <b>Formulation match</b>
                <span>
                  {verifyResult.rxnorm?.valid ? "✓ MATCH" : "✕ MISMATCH"}
                </span>
                <b>Dose match</b>
                <span>
                  {verifyResult.doseCheck?.valid ? "✓ MATCH" : "✕ MISMATCH"}
                </span>
                <b>Prescribed dose</b>
                <span>
                  {verifyResult.doseCheck?.prescribed ||
                    (verifyResult.doseCheck?.prescribedMg != null
                      ? `${verifyResult.doseCheck.prescribedMg} mg`
                      : "—")}
                </span>
                <b>Overall verification</b>
                <span>
                  {verifyResult.clinicallyVerified
                    ? "✓ VERIFIED"
                    : "✕ REVIEW REQUIRED"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      {dispatch && (
        <div className="modal" onClick={() => setDispatch(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button className="x" onClick={() => setDispatch(null)}>
              ×
            </button>
            <h3>Dispatch {dispatch.requestNo}</h3>
            <p>
              Creates FHIR MedicationDispense and sends a PHI-safe nurse alert.
            </p>
            <label>
              Courier
              <input
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
              />
            </label>
            <label>
              ETA (minutes)
              <input
                type="number"
                min="1"
                value={etaMinutes}
                onChange={(e) => setEtaMinutes(+e.target.value)}
              />
            </label>
            <button
              disabled={busy || !courier || etaMinutes < 1}
              onClick={doDispatch}
            >
              <Truck /> Dispatch Medication
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
function Notifications({ rows, onOpen }: any) {
  return (
    <section>
      <h3>PHI-safe alerts</h3>
      <p>
        Lock-screen messages intentionally exclude patient identifiers and
        medication details. Click an alert to open its request.
      </p>
      <div className="notificationList">
        {rows.map((n: any) => (
          <div
            className="note"
            key={n.id}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer", opacity: n.read ? 0.82 : 1 }}
            onClick={() => onOpen(n)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(n);
              }
            }}
          >
            <span>
              <Bell />
            </span>
            <div>
              <b>
                {n.title}
                {!n.read ? " · NEW" : ""}
              </b>
              <p>{n.message}</p>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </div>
          </div>
        ))}
        {!rows.length && <div className="empty">No notifications yet.</div>}
      </div>
    </section>
  );
}
function Inventory({ token }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    call("/api/inventory", token).then(setRows);
  }, []);
  return (
    <section>
      <h3>Cold-chain inventory</h3>
      <p>
        Refrigerated stock with RxNorm identifiers and 2–8°C storage limits.
      </p>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Medication</th>
              <th>RxCUI</th>
              <th>Lot</th>
              <th>Stock</th>
              <th>Storage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.medicationName}</b>
                  <small>{r.strength}</small>
                </td>
                <td>{r.rxnormRxcui || "—"}</td>
                <td>{r.lotNumber}</td>
                <td>
                  {r.quantity}
                  {r.quantity <= r.reorderLevel ? " · LOW" : ""}
                </td>
                <td>
                  {r.refrigerator || "—"} · {r.minTemp}–{r.maxTemp}°C
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Audit({ token }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    call("/api/audits", token).then(setRows);
  }, []);
  return (
    <section>
      <h3>Hash-chained audit log</h3>
      <p>
        Each event stores its previous hash, making retrospective modification
        detectable.
      </p>
      <div className="audit">
        {rows.map((r) => (
          <div>
            <b>{r.action}</b>
            <span>
              {r.entityType} #{r.entityId}
            </span>
            <code>{r.hash.slice(0, 20)}…</code>
            <small>{new Date(r.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
