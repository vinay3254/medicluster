/**
 * backend/routes/authRoutes.js
 * Clinician sign-in, account requests and onboarding profile.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { ROLES } = require("../models/User");
const { signToken, requireAuth } = require("../middleware/auth");
const { normEmail, staffEmails, staffAllowed } = require('../services/staffAccess');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// bcrypt only hashes the first 72 bytes; reject longer input instead of silently truncating.
const MAX_PASSWORD = 72;
// Compared against when the email is unknown so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("medicluster-dummy-password", 10);

// An exact-email list takes priority over domain access. With neither configured,
// nobody can self-register. An exact list also restricts existing accounts.
function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function canRegister(email) {
  const exactEmails = staffEmails();
  return exactEmails.length > 0
    ? exactEmails.includes(email)
    : allowedDomains().includes(email.split('@')[1]);
}

// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/register", async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const { password } = req.body;

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid work email" });
    if (!canRegister(email)) {
      return res.status(403).json({ error: "This email isn't enabled for MediCluster. Ask your administrator for access." });
    }
    if (!name) return res.status(400).json({ error: "Enter your name" });
    if (typeof password !== "string" || password.length < MIN_PASSWORD || Buffer.byteLength(password) > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await User.create({ email, name, passwordHash });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "An account with this email already exists" });
      throw err;
    }

    return res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const { password } = req.body;
    if (!email || typeof password !== "string") {
      return res.status(400).json({ error: "Enter your email and password" });
    }
    if (!staffAllowed(email)) return res.status(403).json({ error: "This account isn't enabled for clinician access" });

    const user = await User.findOne({ email }).select("+passwordHash");
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Email or password is incorrect" });

    return res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    return res.json({ user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/auth/me ── onboarding: role, department, completion ─────────
router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const update = {};
    const { role, department, onboarded } = req.body;

    if (role !== undefined) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: "Unknown role" });
      update.role = role;
    }
    if (department !== undefined) {
      if (typeof department !== "string" || department.length > 100) {
        return res.status(400).json({ error: "Invalid department" });
      }
      update.department = department.trim();
    }
    if (onboarded === true) update.onboardedAt = new Date();

    const user = await User.findByIdAndUpdate(req.userId, update, { new: true, runValidators: true });
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    return res.json({ user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
