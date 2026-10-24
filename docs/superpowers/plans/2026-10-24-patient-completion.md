# Patient app completion implementation plan

**Goal:** Complete patient workflows and maintain the MediCluster ivory/sage theme, without promotional art or scroll-heavy screens.

**Architecture:** Keep the existing React patient portal and Android WebView shell. Add authenticated patient-owned appointments, documents, and CAD tracking endpoints through Express. Use account-scoped offline snapshots and a production service worker; native Android schedules notifications independently of the WebView.

**Constraints:** Preserve existing credentials and account boundaries. Do not change unrelated uncommitted work, expose service keys, fabricate medical records, claim unconfirmed appointments, or disable authentication. Reuse Supabase generic models and private media storage. Show external service/network failures truthfully. Do not deploy or replace published signed APKs without available publisher signing credentials.

## Contract and tasks

- [ ] Backend: mount patient feature router at `/api/patient-app`. Patient/clinician ownership checks on `/:patientId/appointments`, `/:patientId/documents`, `/:patientId/documents/:id/content`, `/:patientId/emergencies`, and `/:patientId/emergencies/:id`. Appointments persist requests and allow reschedule/cancel, with explicit clinic confirmation state. Documents persist uploaded files in existing private storage. Emergency creation uses actual CAD incident rows and tracking reads assigned ambulance GPS with timestamps, never invented ETA.
- [ ] Android: schedule owned medicine alarms while app is closed, notification permission, reboot/time changes and logout cleanup. Fixed origin-checked custom scheme requests trigger native reading of a frontend schedule snapshot; no general JavaScript bridge. Supply frontend integration contract and native tests/build evidence.
- [ ] Offline: account-scoped patient snapshots, queued reading/dose mutations with replay/retry and logout deletion. Production service worker caches shell/static files only, never authenticated API responses. Offline views show cache age and pending changes. Provide helper contract and tests.
- [ ] Patient frontend: shared ivory/sage tokens, rounded cards/pill controls, five concise navigation destinations; per-screen tabs/pagination maintain viewport fit. Build visits booking/reschedule, reports upload/preview/download, emergency tracking and offline/reminder settings. Preserve existing medicines, AI, logs and emergency dialing; no removed hero illustration.
- [ ] Verify: meaningful backend ownership and lifecycle tests; frontend behavior/build/unit checks; browser checks at phone and desktop sizes including offline, appointments/documents/tracking; native checks where toolchain exists. Review final changes and state hosting/signing/device limits precisely.

## Frontend API shapes

Appointments: `{_id,patientId,at,doctor,department,location,reason,status,createdAt}`; POST `{at,doctor,department,location,reason}`, PATCH by ID for reschedule/cancel. Documents: `{_id,original_name,mimetype,size,createdAt,file_type}`; multipart `file`; authenticated blob content route. Emergencies: POST `{latitude,longitude,description}` -> `{id,status,...}`; GET list/ID -> `{id,status,createdAt,updatedAt,ambulance:null|{callSign,latitude,longitude,lastPing},hospital:null|{name,latitude,longitude},location:{latitude,longitude}}`. Backend agent may refine field names and must report exact final contract before frontend integration.
