# Patient app status — 2026-10-25

Implemented locally: protected clinician appointment inbox; clinic confirmation, cancellation and completion controls; patient appointment detail view; preserved offline reading timestamps with ISO validation and safe retries. Review also fixes mobile inbox access and reports appointment load failures.

Production frontend Docker image now runs the existing API proxy server. Docker Compose supplies `BACKEND_URL=http://backend:5000`. No live deployment occurred.

Verification: backend 83 tests pass; frontend 59 tests pass; production build and typecheck pass. Final patient/clinic browser suite: 8 passed, zero failed, including mobile and desktop clinic workflows. Frontend production Docker image builds successfully; Compose configuration resolves the backend proxy target. Removed agy’s additional unit test because it tested duplicate helper implementations rather than production code; browser checks exercise production helpers.

## Android

Updated local canonical installer from remote main to signed release 1.0.8. SHA-256 matches release metadata; reminder scheduling classes are present.

Fresh Docker build using JDK 17, Gradle 8.11.1 and Android SDK 35 passed all 24 native unit tests and release lint (zero errors). Release APK builds with the existing publisher key and passes APK v2 signature verification. Fresh signed artifact: `medicluster/patient-android/review/medicluster-patient-1.0.8-signed.apk`. Fresh debug artifact: `medicluster/patient-android/review/medicluster-patient-debug-review.apk`.

No physical device is connected. Reboot/battery behavior and Google browser return remain hardware verification tasks.

## Live service

Live frontend and backend health endpoints now return HTTP 200 with database readiness. Previous 502 was transient. Publishing tested source changes and verifying deployment is the remaining release step. No live patient data was written.
