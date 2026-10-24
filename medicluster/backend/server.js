/**
 * backend/server.js
 * Express API gateway for MediCluster.
 * Persists data in Supabase and proxies ML requests to the Python engine.
 */

require("dotenv").config();
const express = require("express");
const { rpc } = require("./db/supabase");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const dataRoutes = require("./routes/dataRoutes");
const clusterRoutes = require("./routes/clusterRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const reminderRoutes  = require("./routes/reminderRoutes");
const dispatchRoutes  = require("./routes/dispatchRoutes");
const triageRoutes    = require("./routes/triageRoutes");
const aiRoutes        = require("./routes/aiRoutes");
const mlRoutes        = require("./routes/mlRoutes");
const healthRoutes    = require("./routes/healthRoutes");
const settingsRoutes  = require("./routes/settingsRoutes");
const patientAppRoutes = require("./routes/patientAppRoutes");
const authRoutes      = require("./routes/authRoutes");
const alertRoutes     = require("./routes/alertRoutes");
const patientAuthRoutes = require("./routes/patientAuthRoutes");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ── Middleware ────────────────────────────────────────────────────────────────
const CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173",
  ...(process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean)];
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, _res, next) => {
  const url = req.path.startsWith('/api/patient-auth') ? req.path : req.url;
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);
  next();
});
// ── Routes ────────────────────────────────────────────────────────────────────
app.use(require('./routes/patientInstallerRoutes')(
  fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))
    ? PUBLIC_DIR : path.join(__dirname, '../frontend/public')
));
app.use("/api/auth",    authRoutes);
app.use("/api/patient-auth", patientAuthRoutes);
app.use("/api/sms-gateway", require('./routes/smsGatewayRoutes'));
// Clinician-only data. Patient-app and dispatch endpoints stay unauthenticated.
app.use("/api/data",    requireAuth, dataRoutes);
app.use("/api/cluster", requireAuth, clusterRoutes);
app.use("/api/alerts",  requireAuth, alertRoutes);
app.use("/api/intelligence", require("./routes/intelligenceRoutes"));
app.use("/api/media", mediaRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/triage",  triageRoutes);
app.use("/api/ai",      aiRoutes);
app.use("/api/ml",      requireAuth, mlRoutes);
app.use("/api/health",  healthRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/patient-app", require("./routes/patientFeatureRoutes"));
app.use("/api/patient-app", patientAppRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await rpc('mc_count', { p_collection: 'users', p_filter: {} });
    res.json({ status: "ok", service: "medicluster-backend", database: "supabase" });
  } catch {
    res.status(503).json({ status: "degraded", service: "medicluster-backend", database: "unavailable" });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// ── Built frontend (production image) ───────────────────────────────────────
// Serves the React app from ./public and falls back to index.html for client routes.
if (fs.existsSync(path.join(PUBLIC_DIR, "index.html"))) {
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
}

app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = status === 503 ? "Service temporarily unavailable. Please try again shortly."
    : status >= 500 ? "Internal server error" : err.message;

  if (err.name === "MulterError") {
    status = 400;
    message = err.code === "LIMIT_FILE_SIZE"
      ? "CSV file is too large"
      : err.message;
  }

  if (status >= 500) {
    console.error("Unhandled API error:", err);
  }

  res.status(status).json({ error: message });
});

// Supabase is configured through runtime environment variables, never browser keys.
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`MediCluster backend running on port ${PORT}; storage: Supabase`));
  const cleanupExpired = () => rpc('mc_cleanup_expired', { p_limit: 1000 }).catch(() => {
    console.warn('Supabase expiry cleanup unavailable; check backend credentials and SQL migration.');
  });
  cleanupExpired();
  const cleanupTimer = setInterval(cleanupExpired, 15 * 60_000);
  cleanupTimer.unref();
  server.on('close', () => clearInterval(cleanupTimer));
}

module.exports = app;
