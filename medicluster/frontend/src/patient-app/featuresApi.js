import api from '../api/apiClient';

const base = patientId => `/patient-app/${encodeURIComponent(patientId)}`;
export const getAppointments = async id => (await api.get(`${base(id)}/appointments`)).data;
export const bookAppointment = async (id, body) => (await api.post(`${base(id)}/appointments`, body)).data;
export const changeAppointment = async (id, appointmentId, body) => (await api.patch(`${base(id)}/appointments/${encodeURIComponent(appointmentId)}`, body)).data;
export const getDocuments = async id => (await api.get(`${base(id)}/documents`)).data;
export const uploadDocument = async (id, file) => { const data = new FormData(); data.append('file', file); return (await api.post(`${base(id)}/documents`, data, { headers: { 'Content-Type': 'multipart/form-data' } })).data; };
export const getDocumentContent = async (id, documentId) => (await api.get(`${base(id)}/documents/${encodeURIComponent(documentId)}/content`, { responseType: 'blob' })).data;
export const getDocumentLink = async (id, documentId, download = false) => (await api.get(`${base(id)}/documents/${encodeURIComponent(documentId)}/link${download ? "?download=1" : ""}`)).data;
export const getEmergencies = async id => (await api.get(`${base(id)}/emergencies`)).data;
export const requestEmergency = async (id, body, key) => (await api.post(`${base(id)}/emergencies`, body, { headers: { 'Idempotency-Key': key } })).data;
export const getEmergency = async (id, emergencyId) => (await api.get(`${base(id)}/emergencies/${encodeURIComponent(emergencyId)}`)).data;
