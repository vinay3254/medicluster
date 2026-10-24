# MediCluster Patient — Android

Installable Android 8.0+ app for patients. It opens the existing HTTPS patient portal,
not clinician or dispatch screens. Internet is required. It uses the same linked-mobile
OTP login and patient API authorization as the website. The website also supports linked
email OTP and Google sign-in when configured on the server. SMS and EmailJS delivery
must be configured separately. Installing the APK does not configure authentication
providers or background medicine alerts.

## Design

A small native Android WebView shell loads `https://medicluster-frontend.onrender.com/app`.
Patient routes stay in the app. Phone calls open the dialer; external HTTPS links open
another app. Non-patient routes on the clinic origin are blocked. The frontend recognizes
the shell's user agent to hide staff links and the desktop phone frame. This hint is for
presentation, not authentication. There is no JavaScript-to-native bridge.

Google sign-in leaves the WebView for the system browser through the exact configured
HTTPS `/api/patient-auth/google/start?platform=android&handoff_challenge=…` endpoint.
The frontend stores a separate PKCE verifier in this WebView's localStorage and supplies
its 43-character base64url SHA-256 challenge. All other staff and API navigation on the
clinic origin remains blocked. The start URL and query reach the browser unchanged.

Configure Google OAuth as a **web application**, with the server's HTTPS callback as
an authorized redirect URI. Google client credentials and EmailJS credentials belong
on the server, never in the APK. The server finishes Google OAuth before redirecting to
our own `mediclusterpatient://google-return?code=…` app handoff; the custom scheme is
not Google's OAuth redirect URI. Only a 64-character hexadecimal, short-lived, one-time
handoff code or a known authentication error is accepted. The app constructs its own
HTTPS `/app?patient_auth_code=…` (or `auth_error=…`) URL. Tokens and arbitrary return
destinations are rejected.

The activity handles both a cold launch and a return to the running app. A running
WebView and its localStorage are preserved. Ordinary resume emits the fixed
`medicluster:patient-resumed` page event so the frontend can recover when the browser
is dismissed without completing sign-in; it does not reload the page or pass any data.
The frontend must redeem the code with its
stored verifier; custom schemes can be claimed by other installed apps, so the server
must require that verifier and expire handoff codes. Clearing app data or losing the
verifier requires starting sign-in again. A browser and configured Google web OAuth
credentials are required; the APK alone cannot enable Google sign-in. Browser-to-app
return and account selection still need verification on a physical Android device.

Location permission is requested only for the configured HTTPS origin. Denying permission
leaves the rest of the portal usable. Photo selection uses Android's picker. HTTPS errors
are never bypassed. An unavailable server shows a retry screen. Records and reminders
need a network connection; the native app does not add offline clinical storage or
reliable alarms when the app is closed.

## Build and publish

GitHub Actions workflow **Patient Android APK** runs tests, Android lint, a signed release
build, and signature verification. It publishes the APK and checksum metadata into
`frontend/public/downloads/`, triggering the normal website deployment. Keeping the
installer in the website means patients need no GitHub account even when this repo is
private. Run the workflow manually for a new version; native source changes on `main`
also trigger it. Website-only changes do not require rebuilding the shell.

Required Actions secrets:

- `PATIENT_KEYSTORE_BASE64`: base64-encoded release keystore.
- `PATIENT_KEYSTORE_PASSWORD`: keystore password.
- `PATIENT_KEY_ALIAS`: release key alias.
- `PATIENT_KEY_PASSWORD`: key password.

Back up the signing key and passwords outside Git. Every update must use the same key
and a higher version code. Losing the key prevents installing updates over existing apps.
No signing key, password, API credential, or patient data belongs in the APK source.

Local build prerequisites: JDK 17, Gradle 8.11.1, Android SDK platform 35 and build tools
35.0.0. Set `ANDROID_HOME` and the signing environment variables above (use
`PATIENT_KEYSTORE_PATH` instead of base64). Then run from this directory:

```bash
gradle :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease
```

`PATIENT_APP_ORIGIN` can override the clinic's HTTPS origin. Changing it requires a new
APK. Release version defaults to 1.0.0/code 1 locally; CI assigns increasing run numbers.

After website deployment, `/app` offers **Download Android app** on the patient login
screen. Share `/download` for installation. Legacy `/downloads/medicluster-patient.apk`
links redirect there, including URLs with checksum query parameters. The download
button fetches `GET /downloads/medicluster-patient.apk` with
`X-MediCluster-Installer: 1`, checks size and SHA-256, then saves one APK without
navigating away. APKs ship with the frontend, so separate frontend deployments
do not need backend access to the installer files. HTML wake-up pages never become APK downloads.
Release metadata and SHA-256 are in `/downloads/patient-app.json`. Android may ask the user to
allow installation from their browser. This is direct distribution, not a Play Store listing.
