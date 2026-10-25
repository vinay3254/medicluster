# Patient feature API

All paths below start with `/api/patient-app/:patientId` and require a Bearer patient session for that patient or a clinician session. Responses are private and `no-store`. Collection responses are JSON arrays, errors are `{error}`. Dates are ISO timestamps. New collections use existing `mc_*` storage RPCs; no schema migration is required.

## Appointments

- `GET /api/patient-app/appointments`: clinician-only clinic inbox, latest 100 by appointment time descending, including patient IDs. Patient sessions receive 403; missing sessions receive 401. Responses are private and `no-store`.
- `GET /appointments`: latest 100 by appointment time descending.
- `POST /appointments`: `{at,doctor,department,location,reason}`. Future `at`, nonempty doctor/location required. Maximum lengths: doctor/department 200, location 300, reason 2000. Returns 201 `{_id,patientId,at,doctor,department,location,reason,status,createdAt,updatedAt}`. Status is always `REQUESTED`; requests do not imply availability or a confirmed booking.
- `PATCH /appointments/:id`: `{at}` reschedules and returns to `REQUESTED`; `{status:"CANCELLED"}` cancels. Only clinicians can submit `{status:"CONFIRMED"}` or complete a confirmed appointment with `{status:"COMPLETED"}`. Closed records cannot change. Concurrent changes return 409 and require refresh. Foreign record IDs return 404.

## Documents

- `GET /documents`: latest 100 media records, metadata only.
- `POST /documents`: multipart form with one `file`, no additional fields. Accepts PDF/JPEG/PNG/WebP, with MIME and file signature validation, maximum 10 MiB. Saves to existing private media bucket and returns 201 metadata; cleans up uploaded objects when metadata creation fails.
- `GET /documents/:id/link`: ownership checked before generating a private Storage signed URL, `{url,expiresAt}`, lifetime 120 seconds. `?download=1` requests a download filename. Only request on explicit open/download and never persist the signed URL in offline caches.
- Metadata: `{_id,original_name,mimetype,size,createdAt,file_type}`; `file_type` is `image` or `document`.
- `GET /documents/:id/content`: authenticated bytes; `?download=1` requests attachment. Authorization checks media ownership before storage reads. Storage object IDs/keys and analyses are never included in metadata.

## Emergencies

- `POST /emergencies`: `{latitude,longitude,description}` and a required `Idempotency-Key` header with 8–128 letters, digits, `_` or `-`. Description optional, maximum 2000 characters. Coordinates must be finite numbers in geographic bounds. Keep the same key and exact body for retries; conflicting reuse returns 409.
- Creates a patient-owned association and actual CAD `public.incidents` row through backend service credentials, status `PENDING`. It does not assign a vehicle/hospital or estimate arrival time. Creation must succeed in CAD before the API returns 201.
- `GET /emergencies`: latest 20 associations mapped to their current CAD state. `GET /emergencies/:id`: one owned incident. IDs are opaque `PAT-...` strings. A CAD outage or association whose create has not yet reached CAD returns 503; retry the original POST with the same key.
- Every result: `{id,status,createdAt,updatedAt,location:{latitude,longitude},ambulance:null|{callSign,latitude,longitude,lastPing},hospital:null|{name,latitude,longitude}}`. GPS freshness comes directly from `lastPing`; no telemetry or ETA is invented.
- Deterministic patient-scoped IDs plus insert-on-conflict-ignore allow retry after interrupted writes, including multiple server processes, without overwriting a dispatcher's assignment or status. Retry uses the same persisted location and description.

## Offline mutations

`POST /readings` additionally accepts optional `Idempotency-Key` in the same format and optional `takenAt` ISO timestamp string with an explicit timezone (UTC `Z` or numeric offset) and up to three fractional second digits. Supplied timestamps are validated and preserved so offline readings keep their measurement time. Omitting `takenAt` uses the server time on first creation; retries retain that original time. Concurrent identical retries return the same record with 201; differing measurement payload or supplied timestamp with the same key returns 409. Existing reminder dose writes use the `(date,time)` slot as their atomic duplicate guard.

## Verification

`npm test` includes `tests/patientFeatures.test.js`: actual generic storage in isolated PGlite plus local HTTP endpoints, private media adapter fixtures, and a CAD transport fixture. Tests never write live incidents or medical data.
