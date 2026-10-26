/**
 * backend/middleware/auth.js
 * JWT session tokens for clinician accounts.
 */

const jwt = require("jsonwebtoken");
const User = require('../models/User');
const { staffEmails, staffAllowed } = require('../services/staffAccess');

const TOKEN_TTL = "12h";

function secret() {
  const value = process.env.JWT_SECRET;
  // Fail closed: never sign or accept tokens with a missing or trivially short secret.
  if (!value || value.length < 32) {
    const err = new Error("Authentication is not configured (JWT_SECRET must be at least 32 characters)");
    err.status = 503;
    throw err;
  }
  return value;
}

const PATIENT_TOKEN_TTL = "30d";

function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, secret(), { expiresIn: TOKEN_TTL });
}

// Patient sessions (mobile app) carry kind "patient" and only grant access to that patient's own data.
function signPatientToken(patientId) {
  return jwt.sign({ sub: patientId, kind: "patient" }, secret(), { expiresIn: PATIENT_TOKEN_TTL });
}

// → { kind: "clinician", userId } | { kind: "patient", patientId } | null (missing/invalid). Throws if unconfigured.
function readSession(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const key = secret();
  try {
    const p = jwt.verify(token, key);
    return p.kind === "patient" ? { kind: "patient", patientId: p.sub } : { kind: "clinician", userId: p.sub };
  } catch {
    return null;
  }
}

// Clinician-only APIs. Patient tokens are rejected.
async function requireAuth(req, res, next) {
  let session;
  try { session = readSession(req); } catch (err) { return next(err); }
  if (!session) return res.status(401).json({ error: "Sign in required" });
  if (session.kind !== "clinician") return res.status(403).json({ error: "Clinician sign-in required" });
  try {
    if (!await allowedClinicianSession(session)) return res.status(403).json({ error: "This account isn't enabled for clinician access" });
  } catch (err) { return next(err); }
  req.userId = session.userId;
  return next();
}

// Clinicians, or the signed-in patient. Use canAccessPatient(req, id) to check a specific record.
async function requirePatientOrClinician(req, res, next) {
  let session;
  try { session = readSession(req); } catch (err) { return next(err); }
  if (!session) return res.status(401).json({ error: "Sign in required" });
  try {
    if (session.kind === 'clinician' && !await allowedClinicianSession(session)) {
      return res.status(403).json({ error: "This account isn't enabled for clinician access" });
    }
  } catch (err) { return next(err); }
  req.session = session;
  return next();
}

async function allowedClinicianSession(session) {
  if (staffEmails().length === 0) return true;
  const user = await User.findById(session.userId).select('email');
  return Boolean(user && staffAllowed(user.email));
}

const canAccessPatient = (req, patientId) =>
  req.session?.kind === "clinician" || (req.session?.kind === "patient" && req.session.patientId === patientId);

module.exports = { signToken, signPatientToken, requireAuth, requirePatientOrClinician, canAccessPatient };
