import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 180_000, // 3 minutes for large clustering runs
  headers: { "Content-Type": "application/json" },
});

// ── Session ──────────────────────────────────────────────────────────────────
// Clinicians (web app) and patients (mobile app under /app) keep separate sessions,
// so signing in on one never signs out or impersonates the other.
const TOKEN_KEY = "medicluster.token";
const PATIENT_TOKEN_KEY = "medicluster.patientToken";
const inPatientApp = () => window.location.pathname === "/app" || window.location.pathname.startsWith("/app/");

function readKey(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeKey(key, token) {
  try {
    if (token) localStorage.setItem(key, token);
    else localStorage.removeItem(key);
  } catch { /* storage unavailable: session lasts for this page load only */ }
}

export const getToken = () => readKey(TOKEN_KEY);
export const setToken = (token) => writeKey(TOKEN_KEY, token);
export const getPatientToken = () => readKey(PATIENT_TOKEN_KEY);
export const setPatientToken = (token) => writeKey(PATIENT_TOKEN_KEY, token);

api.interceptors.request.use((config) => {
  const token = inPatientApp() ? getPatientToken() : getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 means the token is missing, expired or revoked; the matching session listens and signs out.
api.interceptors.response.use(undefined, (err) => {
  if (err?.response?.status === 401) {
    if (inPatientApp() && getPatientToken()) {
      setPatientToken(null);
      window.dispatchEvent(new Event("medicluster:patient-signed-out"));
    } else if (!inPatientApp() && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event("medicluster:signed-out"));
    }
  }
  return Promise.reject(err);
});

/** Patient sign-in, step 1: text a one-time code to a linked mobile number. */
export async function requestPatientCode(mobile) {
  const res = await api.post("/patient-auth/request-code", { mobile });
  return res.data;
}

/** Patient sign-in, step 2 → { token, patientId, name } */
export async function verifyPatientCode(mobile, code) {
  const res = await api.post("/patient-auth/verify", { mobile, code });
  return res.data;
}

export async function getPatientAuthConfig() {
  const res = await api.get("/patient-auth/config");
  return res.data;
}

export async function requestPatientEmailCode(email) {
  const res = await api.post("/patient-auth/request-email-code", { email });
  return res.data;
}

export async function verifyPatientEmailCode(email, code) {
  const res = await api.post("/patient-auth/verify-email", { email, code });
  return res.data;
}

export async function exchangePatientGoogleCode(code, verifier) {
  const res = await api.post("/patient-auth/google/exchange", { code, verifier });
  return res.data;
}

export async function login(email, password) {
  const res = await api.post("/auth/login", { email, password });
  return res.data;
}

export async function register(name, email, password) {
  const res = await api.post("/auth/register", { name, email, password });
  return res.data;
}

export async function getMe() {
  const res = await api.get("/auth/me");
  return res.data.user;
}

export async function updateMe(patch) {
  const res = await api.patch("/auth/me", patch);
  return res.data.user;
}

/**
 * Upload a CSV file and return { datasetId, featureNames, rowCount, preview }
 */
export async function uploadDataset(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post("/data/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/**
 * Run clustering on a stored dataset.
 * @param {string} datasetId
 * @param {string} algorithm  kmeans | dbscan | hierarchical | gmm | all
 * @param {object} params     algorithm-specific params
 * @param {Array<object>} data optional inline rows for sample/offline datasets
 */
export async function runClustering(datasetId, algorithm, params = {}, data) {
  const body = { datasetId, algorithm, params };
  if (Array.isArray(data)) body.data = data;
  const res = await api.post("/cluster", body);
  return res.data;
}

/**
 * Get a previously saved cluster result by ID.
 */
export async function getClusterResult(id) {
  const res = await api.get(`/cluster/${id}`);
  return res.data;
}

/** Alerts derived from clustering, reminders and imaging, each with a `read` flag. */
export async function listAlerts() {
  const res = await api.get("/alerts");
  return res.data;
}

export async function ackAlerts(ids) {
  const res = await api.post("/alerts/ack", { ids });
  return res.data;
}

/** Whether the Python ML engine is reachable: { online: boolean } */
export async function getMlHealth() {
  const res = await api.get("/health/ml", { timeout: 5_000 });
  return res.data;
}

/**
 * Get all clustering runs for a dataset.
 */
export async function getHistory(datasetId) {
  const res = await api.get(`/cluster/history/${datasetId}`);
  return res.data;
}

/**
 * List all stored datasets.
 */
export async function listDatasets({ page = 1, limit = 20 } = {}) {
  const res = await api.get("/data", { params: { page, limit } });
  return res.data;
}

/**
 * Upload a media file (image or document) for a patient.
 */
export async function uploadPatientMedia(patientId, file) {
  const form = new FormData();
  form.append("file", file);
  form.append("patient_id", patientId);
  const res = await api.post("/media/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/**
 * List all media files for a patient.
 */
export async function listPatientMedia(patientId) {
  const res = await api.get(`/media/${patientId}`);
  return res.data;
}

/**
 * Delete a media file by its GridFS file ID.
 */
export async function deletePatientMedia(fileId) {
  const res = await api.delete(`/media/file/${fileId}`);
  return res.data;
}

/**
 * Returns the URL to stream/view a media file inline.
 */
export function getMediaFileUrl(fileId) {
  return `/api/media/file/${fileId}`;
}

/**
 * Run deep learning analysis on an uploaded image (CT scan / chest X-ray).
 * Returns { findings: [{label, confidence}], model, model_label, analyzedAt }
 */
export async function analyzePatientMedia(fileId, modelName = "densenet121-res224-all") {
  const res = await api.post(`/media/analyze/${fileId}`, { model_name: modelName }, { timeout: 120_000 });
  return res.data;
}

export async function addImagingToRecord(fileId, patientId) {
  const res = await api.post(`/media/record/${fileId}`, { patient_id: patientId });
  return res.data;
}

export async function flagImagingForReview(fileId) {
  const res = await api.post(`/media/review/${fileId}`);
  return res.data;
}

/**
 * Request an AI plain-English explanation for a set of findings.
 * Returns { explanation: string | null, error?: string }
 */
export async function explainFindings(fileId, findings, modelName = "densenet121-res224-chex") {
  const res = await api.post(
    `/media/explain/${fileId}`,
    { findings, model_name: modelName },
    { timeout: 30_000 }
  );
  return res.data;
}

/**
 * Ask AI — direct multimodal vision & clinical reasoning chat.
 * @param {string} imageBase64  Raw base64 string (optional)
 * @param {string} mediaType    MIME type e.g. "image/jpeg"
 * @param {Array}  chatHistory  [{role, content}] previous turns
 * @param {string} question     New message (empty for initial analysis)
 * @param {string} language     Language code e.g. "en"
 * @param {object} location     Optional user geolocation
 * @param {Array}  images       Optional array of images [{ base64, mediaType, name }]
 */
export async function aiChat(
  imageBase64,
  mediaType,
  chatHistory = [],
  question = "",
  language = "en",
  location = null,
  images = []
) {
  const payload = {
    chatHistory,
    question,
    language,
    location
  };

  if (Array.isArray(images) && images.length > 0) {
    payload.images = images.map((img) => ({
      base64: img.base64,
      mediaType: img.mediaType,
      name: img.name
    }));
    payload.imageBase64 = images[0].base64;
    payload.mediaType = images[0].mediaType;
  } else if (imageBase64) {
    payload.imageBase64 = imageBase64;
    payload.mediaType = mediaType;
    payload.images = [{ base64: imageBase64, mediaType }];
  }

  const res = await api.post("/media/ai-chat", payload, { timeout: 120_000 });
  return res.data;
}

/**
 * List available AI models from the ML engine.
 */
export async function listModels() {
  const res = await api.get("/media/models");
  return res.data;
}

/**
 * List all saved ClusterResults (id, algorithm, createdAt, riskDistribution).
 */
export async function listClusterResults() {
  const res = await api.get("/cluster/results");
  return res.data;
}

/**
 * Predict risk tier for new patient vitals against a saved cluster result.
 * @param {string} resultId  MongoDB ObjectId of the ClusterResult
 * @param {object} vitals    { age, bmi, glucose, ... }
 */
export async function predictRisk(resultId, vitals) {
  const res = await api.post("/cluster/predict", { resultId, vitals });
  return res.data;
}

/**
 * Get clustering history for a specific patient (up to 5 most recent results).
 * Returns [{ resultId, algorithm, createdAt, cluster_id, risk_tier, pca_x, pca_y }]
 */
export async function getPatientClusterHistory(patientId) {
  const res = await api.get(`/cluster/patient/${encodeURIComponent(patientId)}`);
  return res.data;
}

// ── Medication Reminders ──────────────────────────────────────────────────────

/** List all medication reminders for a patient. */
export async function listReminders(patientId) {
  const res = await api.get(`/reminders/${encodeURIComponent(patientId)}`);
  return res.data;
}

/** Create a new medication reminder. */
export async function createReminder(data) {
  const res = await api.post("/reminders", data);
  return res.data;
}

/** Toggle active state or update fields on a reminder. */
export async function updateReminder(id, patch) {
  const res = await api.patch(`/reminders/${id}`, patch);
  return res.data;
}

/** Delete a reminder permanently. */
export async function deleteReminder(id) {
  const res = await api.delete(`/reminders/${id}`);
  return res.data;
}

/** Mark one dose slot (date YYYY-MM-DD, time HH:MM) as taken. Idempotent. */
export async function markDoseTaken(reminderId, date, time, idempotencyKey) {
  const res = await api.post(`/reminders/${reminderId}/doses`, { date, time }, idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined);
  return res.data;
}

// ── Patient App ───────────────────────────────────────────────────────────────

/** Patient-app profile: name, next visit, emergency contact. */
export async function getPatientProfile(patientId) {
  const res = await api.get(`/patient-app/${encodeURIComponent(patientId)}/profile`);
  return res.data;
}

/** Update patient-app profile fields (name, nextVisit, emergencyContact). */
export async function updatePatientProfile(patientId, patch) {
  const res = await api.put(`/patient-app/${encodeURIComponent(patientId)}/profile`, patch);
  return res.data;
}

/** Self-logged readings, newest first. */
export async function listReadings(patientId) {
  const res = await api.get(`/patient-app/${encodeURIComponent(patientId)}/readings`);
  return res.data;
}

/** Log a reading: { type: glucose|bp|weight, value, diastolic?, context? }. */
export async function logReading(patientId, reading, idempotencyKey) {
  const res = await api.post(`/patient-app/${encodeURIComponent(patientId)}/readings`, reading, idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined);
  return res.data;
}

// ── ARIA Ambulance Dispatch ───────────────────────────────────────────────────

/** Seed demo ambulances and hospitals (call once). */
export async function seedDispatch() {
  const res = await api.post("/dispatch/seed");
  return res.data;
}

/** List all ambulances with current status. */
export async function listAmbulances() {
  const res = await api.get("/dispatch/ambulances");
  return res.data;
}

/** Update ambulance status (available | en_route | at_scene). */
export async function updateAmbulanceStatus(ambulanceId, status) {
  const res = await api.patch(`/dispatch/ambulances/${ambulanceId}`, { status });
  return res.data;
}

/** List all hospitals with bed availability. */
export async function listHospitals() {
  const res = await api.get("/dispatch/hospitals");
  return res.data;
}

/** Update hospital bed count. */
export async function updateHospitalBeds(hospitalId, available_beds) {
  const res = await api.patch(`/dispatch/hospitals/${hospitalId}`, { available_beds });
  return res.data;
}

/** Submit emergency to ARIA and get dispatch decision. */
export async function dispatchEmergency(data) {
  const res = await api.post("/dispatch/emergency", data, { timeout: 30_000 });
  return res.data;
}

/** Get recent dispatch history. */
export async function getDispatchHistory() {
  const res = await api.get("/dispatch/history");
  return res.data;
}

/** Update dispatch status (resolved | cancelled). */
export async function updateDispatchStatus(dispatchId, status) {
  const res = await api.patch(`/dispatch/history/${dispatchId}/status`, { status });
  return res.data;
}

// ── Patient Triage (MCI board) ────────────────────────────────────────────────

/** Get all patients for a dispatch incident. */
export async function getIncidentPatients(incidentId) {
  const res = await api.get(`/triage/incidents/${encodeURIComponent(incidentId)}`);
  return res.data;
}

/** Add a patient to an incident (with optional vitals). */
export async function addIncidentPatient(incidentId, data) {
  const res = await api.post(`/triage/incidents/${encodeURIComponent(incidentId)}/patients`, data);
  return res.data;
}

/** Update patient allocation, transport status, or triage category. */
export async function updatePatient(patientId, patch) {
  const res = await api.patch(`/triage/patients/${patientId}`, patch);
  return res.data;
}

/** Append vitals reading + re-score triage. */
export async function addPatientVitals(patientId, vitals) {
  const res = await api.post(`/triage/patients/${patientId}/vitals`, vitals);
  return res.data;
}

/** Stateless triage score from vitals (no DB write). */
export async function scoreTriage(vitals, age, conditionText) {
  const res = await api.post("/triage/score", { vitals, age, condition_text: conditionText });
  return res.data;
}

/** Voice/text-to-triage: Claude extracts vitals + category from free text. */
export async function voiceToTriage(text, incidentId) {
  const res = await api.post("/triage/voice", { text, incidentId }, { timeout: 30_000 });
  return res.data;
}

/** Suggest best hospital for a patient given triage category + pathway flags. */
export async function allocateHospital(triage_category, pathway_flags, exclude_hospital_ids) {
  const res = await api.post("/triage/allocate", { triage_category, pathway_flags, exclude_hospital_ids });
  return res.data;
}

// ── AI Clinical Copilot ───────────────────────────────────────────────────────

/** Auto-select optimal K via Elbow + Silhouette sweep. */
export async function getOptimalK(data) {
  const res = await api.post("/cluster/optimal-k", { data }, { timeout: 60_000 });
  return res.data;
}

/** Run Isolation Forest anomaly detection on patient rows. */
export async function detectAnomalies(data, contamination = 0.05) {
  const res = await api.post("/cluster/detect-anomalies", { data, contamination }, { timeout: 60_000 });
  return res.data;
}

/** SHAP feature importance for a clustered result. */
export async function explainClusters(data, labels) {
  const res = await api.post("/cluster/explain", { data, labels }, { timeout: 90_000 });
  return res.data;
}

/** Grad-CAM heatmap for a stored image file. */
export async function getGradCam(fileId, model_name, target_label) {
  const res = await api.post(`/media/gradcam/${fileId}`, { model_name, target_label }, { timeout: 60_000 });
  return res.data;
}

/** Check drug interactions for a list of medication names. */
export async function checkDrugInteractions(medications) {
  const res = await api.post("/ai/drug-interactions", { medications }, { timeout: 15_000 });
  return res.data;
}

/** Generate AI cohort insights for a clustering result. */
export async function generateClusterInsights(result) {
  const res = await api.post("/ai/cluster-insights", { result }, { timeout: 60_000 });
  return res.data;
}

/** Extract medication reminders from free-text prescription notes. */
export async function generateMedicationPlan(patientId, text, currentReminders = []) {
  const res = await api.post(
    "/ai/medication-plan",
    { patientId, text, currentReminders },
    { timeout: 60_000 }
  );
  return res.data;
}

// ── New ML / NLP Endpoints ────────────────────────────────────────────────────

/** Analyze free-text clinical notes: NER, ICD-10, trajectory, AI summary. */
export async function analyzeNotes(notes) {
  const res = await api.post("/ml/analyze-notes", { notes }, { timeout: 60_000 });
  return res.data;
}

/** Extract symptoms, emergency flags, follow-up questions, and routing. */
export async function extractSymptoms(text) {
  const res = await api.post("/ml/extract-symptoms", { text }, { timeout: 30_000 });
  return res.data;
}

/** Advanced patient risk profile: triage, disease risks, probabilities, care plan. */
export async function getAdvancedRiskProfile(patient) {
  const res = await api.post("/ml/risk-profile", { patient }, { timeout: 30_000 });
  return res.data;
}

/** Cohort-level advanced risk dashboard. */
export async function getPopulationRisk(data) {
  const res = await api.post("/ml/population-risk", { data }, { timeout: 60_000 });
  return res.data;
}

/** Compare previous/current patient state for trend. */
export async function compareVisits(previous, current) {
  const res = await api.post("/ml/compare-visits", { previous, current }, { timeout: 30_000 });
  return res.data;
}

/** Build a longitudinal patient risk timeline from dated events. */
export async function buildPatientTimeline(events) {
  const res = await api.post("/ml/patient-timeline", { events }, { timeout: 30_000 });
  return res.data;
}

/** Find similar patients from candidate records. */
export async function findSimilarPatients(patient, candidates, top_k = 5) {
  const res = await api.post("/ml/similar-patients", { patient, candidates, top_k }, { timeout: 30_000 });
  return res.data;
}

/** Train quick supervised predictive baselines from labelled patient rows. */
export async function trainPredictiveModel(data, target, task = "auto") {
  const res = await api.post("/ml/train-predictive-model", { data, target, task }, { timeout: 90_000 });
  return res.data;
}

/** Calculate MEWS score from patient vitals. */
export async function calcMews(vitals) {
  const res = await api.post("/ml/mews", vitals, { timeout: 10_000 });
  return res.data;
}

/** Forecast vital signs (LSTM / Prophet / linear). */
export async function forecastVitals(vitals_history, steps = 3, method = "auto") {
  const res = await api.post("/ml/forecast-vitals", { vitals_history, steps, method }, { timeout: 60_000 });
  return res.data;
}

/** UMAP or t-SNE dimensionality reduction for patient scatter plots. */
export async function reduceDimensions(data, method = "umap", params = {}) {
  const res = await api.post("/ml/reduce-dimensions", { data, method, params }, { timeout: 60_000 });
  return res.data;
}

/** Rank features by discriminative power across clusters. */
export async function getFeatureImportance(data, algorithm = "kmeans", params = {}) {
  const res = await api.post("/ml/feature-importance", { data, algorithm, params }, { timeout: 60_000 });
  return res.data;
}

/** RAG-based patient Q&A chatbot. */
export async function askPatients(query, patients = null) {
  const body = { query };
  if (patients) body.patients = patients;
  const res = await api.post("/ml/ask", body, { timeout: 30_000 });
  return res.data;
}

export default api;
