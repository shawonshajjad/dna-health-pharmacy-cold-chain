# DNA Health — Pharmacy Cold Chain to Inpatient Floor (Case 1)

Take-home implementation for Case 1, demonstrating an end-to-end pharmacy cold-chain workflow using FHIR R4, NIH/NLM RxNorm, and HL7 v2.

## Overview

This project demonstrates a digital medication workflow between an inpatient ward and hospital pharmacy.

The implementation focuses on standardized clinical data exchange, medication validation, pharmacy fulfillment, PHI-safe operational notifications, and tamper-evident auditing.

## Workflow

1. A nurse selects an inpatient and the application retrieves the patient's active doctor prescription from FHIR `MedicationRequest`.
2. The prescribed medication is resolved and validated against the official NIH/NLM RxNorm API using its RxCUI. The nurse provides only operational request details such as quantity and priority.
3. The pharmacist verifies the request against the source FHIR `MedicationRequest`, including the standardized medication identifier/formulation and structured dose.
4. Packing is blocked until prescription verification succeeds.
5. Incoming legacy HL7 v2 `OMP^O09` messages are accepted through the backend integration endpoint and parsed using `@redoxengine/redox-hl7-v2`.
6. The pharmacy can pack and dispatch the medication with courier and ETA information.
7. Dispatch creates a FHIR `MedicationDispense` linked to the source prescription.
8. The nurse receives an operational delivery notification that excludes patient identifiers and medication details.
9. Security-relevant workflow actions generate FHIR `AuditEvent` resources and are also recorded in a local SHA-256 hash-chained audit trail.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite

### Backend
- Node.js
- Express
- TypeScript
- Prisma ORM
- MySQL / MariaDB

### Healthcare Standards & Services
- HL7 FHIR R4
- FHIR `MedicationRequest`
- FHIR `MedicationDispense`
- FHIR `AuditEvent`
- NIH/NLM RxNav / RxNorm REST API
- HL7 v2 `OMP^O09`
- `@redoxengine/redox-hl7-v2`
- HAPI FHIR public R4 sandbox

## Key Features

- Role-based Nurse and Pharmacist workflow
- Active prescription retrieval from FHIR
- RxNorm/RxCUI medication validation
- Structured prescription and dose verification
- HL7 v2 `OMP^O09` ingestion
- Pharmacy packing and dispatch workflow
- Courier and ETA tracking
- FHIR `MedicationDispense` creation
- PHI-minimized nurse notifications
- FHIR `AuditEvent` logging
- SHA-256 hash-chained local audit trail
- Cold-chain inventory context
- Server-side authorization
- Schema-validated API requests

## Local Setup

### Requirements

- Node.js
- npm
- MySQL or MariaDB

### 1. Server

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Update `.env` as needed. In particular, replace `JWT_SECRET` with a strong random value.

Example configuration:

```env
PORT=4000
DATABASE_URL="mysql://root:@localhost:3306/dna_pharmacy"
JWT_SECRET="replace-with-a-strong-random-secret"
FHIR_BASE_URL="https://hapi.fhir.org/baseR4"
RXNAV_BASE_URL="https://rxnav.nlm.nih.gov/REST"
USE_MOCK_FHIR=false
```

Initialize Prisma and seed the local database:

```powershell
npm run prisma:generate
npm run db:push
npm run db:seed
```

For the live HAPI FHIR demo, provision the demo Patient and MedicationRequest:

```powershell
npm run fhir:seed
```

The seed script creates the required demo FHIR resources and links the returned HAPI Patient ID to the local demo patient.

Start the API:

```powershell
npm run dev
```

The backend runs on:

```text
http://localhost:4000
```

### 2. Client

Open another terminal:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

Default client configuration:

```env
VITE_API_URL="http://localhost:4000"
```

The Vite development server will display the local frontend URL in the terminal.

## Demo Credentials

After running `npm run db:seed`:

**Nurse**

```text
Email: nurse@dna.test
Password: Demo123!
```

**Pharmacist**

```text
Email: pharmacist@dna.test
Password: Demo123!
```

These credentials are for local demonstration only.

## HL7 v2 Integration

Authenticated hospital integrations can submit an `OMP^O09` message to:

```text
POST /api/hl7/omp
```

The endpoint supports JSON:

```json
{
  "message": "<HL7 OMP^O09 message>"
}
```

It also accepts raw HL7 bodies using:

```text
application/hl7-v2
text/hl7
```

HL7 parsing is performed using `@redoxengine/redox-hl7-v2`. The application uses the parser for HL7 structure validation and extracts the required medication-order fields for the workflow.

A sample message is included in:

```text
sample-omp-o09.hl7
```

## FHIR Integration

The workflow uses FHIR R4 resources for the clinical exchange.

### MedicationRequest

The active doctor's prescription is retrieved from the configured FHIR server. Medication identity is based on standardized RxNorm coding rather than free-text medication matching.

### MedicationDispense

When pharmacy dispatch occurs, the backend creates a FHIR `MedicationDispense` containing the relevant dispensing information and links it to the authorizing prescription.

Operational dispatch information includes packed/dispatch timing, courier information, and ETA.

### AuditEvent

Security-relevant workflow actions generate FHIR `AuditEvent` records.

For HL7 orders that use a local placer-order identifier rather than a FHIR resource ID, the audit record stores the external order identifier instead of creating an invalid FHIR resource reference.

## RxNorm Validation

Medication validation uses the official NIH/NLM RxNav / RxNorm REST API.

The workflow uses the prescription's RxCUI as the standardized medication identifier and validates it against RxNorm before pharmacist verification can succeed.

This avoids relying on free-text medication-name matching for clinical validation.

## PHI-Safe Notifications

Nurse delivery notifications intentionally contain only operational delivery information.

For example:

```text
Your pharmacy request is out for delivery.
Courier: Courier Rahim.
ETA: 09:55 PM.
```

Patient names, MRNs, medication names, and other unnecessary clinical information are excluded from these alerts.

## Audit Trail

The project maintains two audit mechanisms:

1. FHIR `AuditEvent` records for standards-based audit integration.
2. A local SHA-256 hash-chained audit trail.

Each local audit record incorporates the previous record's hash, making later modification of historical entries detectable.

## Security Notes

- Passwords are bcrypt-hashed.
- JWT authentication is used for the demo application.
- JWTs are kept in React memory rather than `localStorage` or `sessionStorage`.
- Nurse and Pharmacist permissions are enforced server-side.
- API request bodies are schema validated.
- PHI is excluded from operational delivery notifications.
- `.env` files are excluded from Git.
- Only `.env.example` files are committed.
- Secrets are not intentionally stored in the repository.

For a production deployment, TLS should be terminated at the appropriate reverse proxy/load balancer and secrets should be managed through an organization-approved secrets-management system.

## Approach

The solution uses a React + TypeScript frontend with a Node.js + Express + TypeScript backend and Prisma/MySQL for application data.

Clinical medication data originates from FHIR `MedicationRequest` resources instead of nurse-entered medication text. Standardized RxCUI identifiers are validated using NIH/NLM RxNorm.

Legacy hospital medication orders can enter through an HL7 v2 `OMP^O09` integration endpoint using an open-source HL7 parser.

The pharmacist workflow verifies the prescription before allowing packing and dispatch. Dispatch generates a FHIR `MedicationDispense`, while operational nurse alerts are deliberately minimized to avoid exposing PHI.

Auditability is handled through both FHIR `AuditEvent` resources and a local hash-chained audit log.

## Assumptions

- Patient and `MedicationRequest` resources originate from the hospital/EHR and already exist in FHIR during normal operation.
- The demo FHIR seed script represents this upstream EHR behavior for local testing.
- NIH/NLM RxNav and the configured FHIR endpoint are reachable during the workflow.
- The prescription contains an RxNorm-coded medication that can be validated using its RxCUI.
- Courier and ETA information are operational pharmacy data supplied during dispatch.
- The public HAPI FHIR R4 server is used as a demonstration sandbox and not as a production clinical data store.
- Demo users and credentials are intended only for local evaluation.

## Potential Improvements

For a production deployment, the next improvements would include:

- SMART on FHIR / OAuth-based EHR authorization
- Organization-managed secrets and production HTTPS configuration
- Durable queues, retries, and dead-letter handling for HL7/FHIR integrations
- Automated unit and integration test coverage
- Production-grade immutable or externally anchored audit storage
- Real cold-chain temperature sensor/telemetry integration
- Alerting for temperature excursions and delivery SLA breaches
- More complete FHIR terminology and profile validation
- Production identity management and stronger session/token lifecycle controls
- Observability, structured logging, metrics, and integration health monitoring

## Requirement Coverage

A separate implementation checklist is available in:

```text
REQUIREMENTS-CHECKLIST.md
```

It maps the Case 1 requirements to the implemented workflow.

---

**Author:** Shajjadur Rahaman Shawon  
**Project:** DNA Health Take-Home — Case 1
