const { defineModel, schema } = require('../db/model');
module.exports = defineModel('PatientEmergency', schema({
  patientId: { type: String, required: true }, incidentId: { type: String, required: true },
  description: String, latitude: Number, longitude: Number,
}, { timestamps: true }));
