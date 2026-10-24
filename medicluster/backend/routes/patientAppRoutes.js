/**
 * backend/routes/patientAppRoutes.js
 * Patient mobile app: profile (visit, emergency contact) and self-logged readings.
 */

const express = require("express");
const crypto = require("node:crypto");
const PatientProfile = require("../models/PatientProfile");
const Reading = require("../models/Reading");

const { requirePatientOrClinician, canAccessPatient } = require("../middleware/auth");
const { normalizeMobile } = require("./patientAuthRoutes");
const { normalizeEmail, validEmail } = require('../services/patientIdentity');

const router = express.Router();

// Every route here is per patient: clinicians may read any record, patients only their own.
router.use(requirePatientOrClinician);
router.use("/:patientId", (req, res, next) =>
  canAccessPatient(req, req.params.patientId) ? next() : res.status(403).json({ error: "Not your record" }));

// ── GET /api/patient-app/:patientId/profile ───────────────────────────────
router.get("/:patientId/profile", async (req, res, next) => {
  try {
    const profile = await PatientProfile.findOne({ patientId: req.params.patientId }).lean();
    return res.json(profile ?? { patientId: req.params.patientId });
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/patient-app/:patientId/profile ───────────────────────────────
router.put("/:patientId/profile", async (req, res, next) => {
  const { name, nextVisit, emergencyContact } = req.body;
  const update = {};
  if (typeof name === "string") update.name = name.trim();
  if (nextVisit && typeof nextVisit === "object") update.nextVisit = nextVisit;
  if (emergencyContact && typeof emergencyContact === "object") update.emergencyContact = emergencyContact;
  // Only clinicians link the sign-in number ("" unlinks it).
  const ops = { $set: update };
  if (req.body.mobile !== undefined && req.session.kind === "clinician") {
    if (req.body.mobile === "") ops.$unset = { mobile: 1 };
    else {
      const mobile = normalizeMobile(req.body.mobile);
      if (!mobile) return res.status(400).json({ error: "Enter a 10-digit Indian mobile number" });
      update.mobile = mobile;
    }
  }
  if (req.body.email !== undefined && req.session.kind === 'clinician') {
    if (req.body.email === '') ops.$unset = { ...(ops.$unset || {}), email: 1, googleSubject: 1 };
    else {
      const email = normalizeEmail(req.body.email);
      if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      update.email = email;
      ops.$unset = { ...(ops.$unset || {}), googleSubject: 1 };
    }
  }
  try {
    const profile = await PatientProfile.findOneAndUpdate(
      { patientId: req.params.patientId },
      ops,
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return res.json(profile);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "That contact detail is already linked to another patient" });
    return next(err);
  }
});

// ── GET /api/patient-app/:patientId/readings ──────────────────────────────
router.get("/:patientId/readings", async (req, res, next) => {
  try {
    const readings = await Reading.find({ patientId: req.params.patientId })
      .sort({ takenAt: -1 })
      .limit(90)
      .lean();
    return res.json(readings);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/patient-app/:patientId/readings ─────────────────────────────
router.post("/:patientId/readings", async (req, res, next) => {
  const { type, value, diastolic, context } = req.body;
  if (!["glucose", "bp", "weight"].includes(type)) {
    return res.status(400).json({ error: "type must be glucose, bp or weight" });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "value must be a positive number" });
  }
  if (type === "bp" && (!Number.isFinite(diastolic) || diastolic <= 0)) {
    return res.status(400).json({ error: "diastolic is required for bp" });
  }
  try {
    const values = {
      patientId: req.params.patientId,
      type,
      value,
      diastolic: type === "bp" ? diastolic : null,
      context: type === "glucose" ? (context ?? "") : "",
    };
    const key = req.get('Idempotency-Key');
    let reading;
    if (key !== undefined) {
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) return res.status(400).json({ error: 'Invalid Idempotency-Key' });
      const _id = crypto.createHash('sha256').update(JSON.stringify(['reading', req.params.patientId, key])).digest('hex').slice(0, 24);
      reading = await Reading.findOne({ _id });
      if (!reading) {
        try { reading = await Reading.create({ _id, ...values }); }
        catch (err) { if (err.code !== 11000) throw err; reading = await Reading.findOne({ _id }); }
      }
      if (Object.entries(values).some(([field, value]) => reading[field] !== value)) return res.status(409).json({ error: 'Idempotency-Key was already used for another reading' });
    } else reading = await Reading.create(values);
    return res.status(201).json(reading);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
