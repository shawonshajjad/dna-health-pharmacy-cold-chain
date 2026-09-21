# Case 1 requirement checklist

- [x] Nurse digital pharmacy indent
- [x] Medication selected from live NIH/NLM RxNorm search; RxCUI stored
- [x] FHIR MedicationRequest discovered/read using patient + standardized RxNorm code
- [x] Requested formulation/RxCUI compared with source prescription
- [x] Structured dose checked against FHIR dosageInstruction
- [x] HL7 v2 OMP^O09 accepted as inbound integration and parsed with Redox (no manual segment splitting)
- [x] Pack + dispatch workflow
- [x] FHIR MedicationDispense write with packed time, courier and ETA
- [x] PHI-minimized nurse delivery alert
- [x] FHIR AuditEvent writes
- [x] SHA-256 hash-chained local audit trail
- [x] Cold-chain inventory context
- [x] Role-based Nurse / Pharmacist authorization
- [x] No auth token persistence in localStorage/sessionStorage
- [x] Live HAPI FHIR mode supported; mock mode is optional only
