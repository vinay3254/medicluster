const { defineModel, schema } = require('../db/model');
module.exports = defineModel('PatientAppointment', schema({
  patientId: { type: String, required: true }, at: { type: Date, required: true },
  doctor: String, department: String, location: String, reason: String,
  status: { type: String, enum: ['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'], required: true },
}, { timestamps: true }));
