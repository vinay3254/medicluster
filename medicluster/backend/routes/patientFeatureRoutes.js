const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const Appointment = require('../models/PatientAppointment');
const Emergency = require('../models/PatientEmergency');
const Media = require('../models/PatientMedia');
const storage = require('../services/mediaStorage');
const cad = require('../services/patientCad');
const { createId } = require('../db/ids');
const { requirePatientOrClinician, canAccessPatient } = require('../middleware/auth');
const router = express.Router();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(requirePatientOrClinician);
router.use('/:patientId', (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  return canAccessPatient(req, req.params.patientId) ? next() : res.status(403).json({ error: 'Not your record' });
});
function text(value, name, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) throw fail(`${name} must be ${required ? 'a nonempty' : 'a'} string of at most ${max} characters`);
  return value.trim();
}
function future(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now()) throw fail('Choose a future appointment date and time');
  return new Date(value);
}
router.get('/:patientId/appointments', route(async (req, res) => res.json(await Appointment.find({ patientId: req.params.patientId }).sort({ at: -1 }).limit(100).lean())));
router.post('/:patientId/appointments', route(async (req, res) => {
  const { at, doctor, department, location, reason } = req.body;
  const record = await Appointment.create({ patientId: req.params.patientId, at: future(at), doctor: text(doctor, 'doctor', 200, true), department: text(department, 'department', 200), location: text(location, 'location', 300, true), reason: text(reason, 'reason', 2000), status: 'REQUESTED' });
  res.status(201).json(record);
}));
router.patch('/:patientId/appointments/:id', route(async (req, res) => {
  const filter = { _id: req.params.id, patientId: req.params.patientId };
  const current = await Appointment.findOne(filter).lean();
  if (!current) throw fail('Appointment not found', 404);
  if (['CANCELLED', 'COMPLETED'].includes(current.status)) throw fail('This appointment is closed', 409);
  const { at, status } = req.body;
  let update;
  if (at !== undefined && status === undefined) update = { at: future(at), status: 'REQUESTED' };
  else if (at === undefined && status === 'CANCELLED') update = { status };
  else if (at === undefined && ['CONFIRMED', 'COMPLETED'].includes(status)) {
    if (req.session.kind !== 'clinician') throw fail('Clinician confirmation required', 403);
    if (status === 'COMPLETED' && current.status !== 'CONFIRMED') throw fail('Confirm the appointment first', 409);
    update = { status };
  } else throw fail('Provide a new at time or a valid status');
  const record = await Appointment.findOneAndUpdate({ ...filter, status: current.status, updatedAt: current.updatedAt }, { $set: update }, { new: true }).lean();
  if (!record) throw fail('Appointment changed; refresh and try again', 409);
  res.json(record);
}));
const metadata = record => ({ _id: record._id, original_name: record.original_name, mimetype: record.mimetype, size: record.size, createdAt: record.createdAt, file_type: record.file_type });
router.get('/:patientId/documents', route(async (req, res) => res.json((await Media.find({ patient_id: req.params.patientId }).sort({ createdAt: -1 }).limit(100).lean()).map(metadata))));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }).single('file');
const uploadFile = (req, res, next) => upload(req, res, err => err ? next(fail(err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 10 MiB' : 'Upload one file only')) : next());
function matchesFile(file) {
  const b = file.buffer;
  return file.mimetype === 'application/pdf' && b.subarray(0, 5).toString() === '%PDF-'
    || file.mimetype === 'image/jpeg' && b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
    || file.mimetype === 'image/png' && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || file.mimetype === 'image/webp' && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
}
router.post('/:patientId/documents', uploadFile, route(async (req, res) => {
  if (!req.file || !matchesFile(req.file)) throw fail('Choose a valid PDF, JPEG, PNG or WebP file');
  const id = createId(); const key = storage.storageKeyFor(id);
  await storage.uploadObject(key, req.file.buffer, req.file.mimetype);
  let record;
  try {
    record = await Media.create({ patient_id: req.params.patientId, original_name: req.file.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 250), mimetype: req.file.mimetype, size: req.file.size, file_type: req.file.mimetype.startsWith('image/') ? 'image' : 'document', gridfs_id: id, storageKey: key });
  } catch (error) { await storage.deleteObject(key).catch(() => {}); throw error; }
  res.status(201).json(metadata(record));
}));
router.get('/:patientId/documents/:id/link', route(async (req, res) => {
  const media = await Media.findOne({ _id: req.params.id, patient_id: req.params.patientId }).lean();
  if (!media) throw fail('Document not found', 404);
  res.json(await storage.signedObjectLink(media, req.query.download === '1'));
}));
router.get('/:patientId/documents/:id/content', route(async (req, res) => {
  const media = await Media.findOne({ _id: req.params.id, patient_id: req.params.patientId }).lean();
  if (!media) throw fail('Document not found', 404);
  const bytes = await storage.readObject(media);
  res.set('Content-Type', media.mimetype);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(media.original_name)}`);
  res.send(bytes);
}));
router.post('/:patientId/emergencies', route(async (req, res) => {
  const { latitude, longitude } = req.body;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw fail('Valid latitude and longitude are required');
  const description = text(req.body.description, 'description', 2000);
  const key = req.get('Idempotency-Key');
  if (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw fail('Idempotency-Key header (8–128 letters, digits, _ or -) is required');
  // A stable, patient-scoped ID makes both ownership registration and CAD insertion safe across processes/retries.
  const digest = crypto.createHash('sha256').update(JSON.stringify([req.params.patientId, key])).digest('hex');
  const _id = digest.slice(0, 24); const incidentId = `PAT-${digest}`;
  let association = await Emergency.findOne({ _id }).lean();
  if (!association) {
    try { association = (await Emergency.create({ _id, patientId: req.params.patientId, incidentId, latitude, longitude, description })).toObject(); }
    catch (error) { if (error.code !== 11000) throw error; association = await Emergency.findOne({ _id }).lean(); }
  }
  if (association.latitude !== latitude || association.longitude !== longitude || association.description !== description) throw fail('Idempotency-Key was already used for another request', 409);
  await cad.ensureIncident(association);
  res.status(201).json(await cad.track(association));
}));
router.get('/:patientId/emergencies', route(async (req, res) => {
  const rows = await Emergency.find({ patientId: req.params.patientId }).sort({ createdAt: -1 }).limit(20).lean();
  res.json(await Promise.all(rows.map(row => cad.track(row))));
}));
router.get('/:patientId/emergencies/:id', route(async (req, res) => {
  const row = await Emergency.findOne({ patientId: req.params.patientId, incidentId: req.params.id }).lean();
  if (!row) throw fail('Emergency not found', 404);
  res.json(await cad.track(row));
}));
module.exports = router;
