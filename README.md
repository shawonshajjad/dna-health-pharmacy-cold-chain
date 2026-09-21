# DNA Health — Pharmacy Cold Chain to Inpatient Floor (Case 1)

Production-style recruitment implementation for Case 1.

## Workflow
1. Nurse selects an inpatient and searches medication against the official NIH/NLM RxNorm API. The selected RxCUI is stored with the indent.
2. The API locates the patient's active doctor order in FHIR using Patient + RxNorm code (not free-text matching) and stores the MedicationRequest ID.
3. Pharmacist verification reads that FHIR MedicationRequest, compares source RxCUI/formulation and structured dose, and blocks packing until verified.
4. Incoming legacy OMP^O09 messages are accepted by the backend integration endpoint and parsed with `@redoxengine/redox-hl7-v2`; there is no raw-HL7 pharmacist test UI and no manual segment splitting.
5. Pharmacy packs and dispatches with courier + ETA. Dispatch writes a FHIR MedicationDispense.
6. Nurse receives a PHI-minimized alert containing operational delivery information only.
7. Security-relevant actions create FHIR AuditEvent records and a local SHA-256 hash-chained audit trail.

## External standards/services
- HL7 FHIR R4: MedicationRequest, MedicationDispense, AuditEvent
- NIH/NLM RxNav / RxNorm REST API
- HL7 v2 OMP^O09 via Redox parser
- HAPI FHIR public R4 sandbox by default

## Local setup
Requires Node.js, MySQL/MariaDB, and npm.

### Server
```powershell
cd server
npm install
Copy-Item .env.example .env
# Replace JWT_SECRET in .env with a strong random value.
npm run prisma:generate
npm run db:push
npm run db:seed
npm run dev
```

For a live HAPI demo, provision the demo Patient + MedicationRequest:
```powershell
npm run fhir:seed
```
The script automatically links the returned HAPI Patient ID to the local demo patient. `USE_MOCK_FHIR=false` is the default example configuration.

### Client
```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Demo credentials after `db:seed`:
- Nurse: `nurse@dna.test`
- Pharmacist: `pharmacist@dna.test`
- Password: `Demo123!`

## HL7 integration
Authenticated hospital integrations POST OMP^O09 payloads to `POST /api/hl7/omp`. JSON `{ "message": "..." }` is supported, as are raw `application/hl7-v2` / `text/hl7` bodies. Parsing is performed by the Redox library.

## Security notes
- Passwords are bcrypt-hashed.
- JWT is held in React memory, not localStorage/sessionStorage.
- Role authorization is enforced server-side.
- Request bodies are schema validated.
- PHI is excluded from delivery notification text.
- `.env` is git-ignored; secrets are not committed.
- Production deployment should terminate TLS at the reverse proxy/load balancer and use organization-managed secrets and EHR authorization appropriate to the deployment environment.
