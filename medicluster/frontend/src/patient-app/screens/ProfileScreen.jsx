import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePatient } from "../PatientApp";
import { Body, ListHeader, TopBar, ErrorNote } from "../ui";
import PatientDownload from "../PatientDownload";
import { isPatientAndroid } from "../patientPlatform";

const field = "h-11 px-3 border border-line-strong rounded bg-surface text-sm focus:outline-none focus:border-ink w-full";

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/** datetime-local value in local time. */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formFromProfile(profile) {
  const v = profile?.nextVisit ?? {};
  const c = profile?.emergencyContact ?? {};
  return {
    name: profile?.name ?? "",
    visitAt: toLocalInput(v.at),
    doctor: v.doctor ?? "",
    department: v.department ?? "",
    location: v.location ?? "",
    checklist: (v.checklist ?? []).map((i) => i.label).join("\n"),
    contactName: c.name ?? "",
    contactRelation: c.relation ?? "",
    contactPhone: c.phone ?? "",
  };
}

/** Edit profile, visit and emergency contact. */
export default function ProfileScreen() {
  const { patientId, setPatientId, profile, saveProfile, apiError } = usePatient();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setForm(formFromProfile(profile)), [profile]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const previous = new Map((profile?.nextVisit?.checklist ?? []).map((i) => [i.label, i.done]));
    try {
      await saveProfile({
        name: form.name,
        nextVisit: {
          at: form.visitAt ? new Date(form.visitAt).toISOString() : null,
          doctor: form.doctor.trim(),
          department: form.department.trim(),
          location: form.location.trim(),
          checklist: form.checklist.split("\n").map((l) => l.trim()).filter(Boolean)
            .map((label) => ({ label, done: previous.get(label) ?? false })),
        },
        emergencyContact: {
          name: form.contactName.trim(),
          relation: form.contactRelation.trim(),
          phone: form.contactPhone.trim(),
        },
      });
      navigate(-1);
    } catch (err) {
      setError(apiError(err));
      setSaving(false);
    }
  };

  const signOut = () => {
    setPatientId("");
    navigate("/app");
  };

  return (
    <>
      <TopBar back="/app" backLabel="Cancel" title="Profile" />
      <Body>
        <form onSubmit={save} className="p-[22px] flex flex-col gap-[22px]">
          <ErrorNote>{error}</ErrorNote>
          <div className="mc-patient-card flex flex-col gap-3">
            <ListHeader title="You" meta={patientId} />
            <Field label="Name"><input value={form.name} onChange={set("name")} className={field} autoComplete="name" /></Field>
          </div>

          <div className="mc-patient-card flex flex-col gap-3">
            <ListHeader title="Next visit" />
            <Field label="Date and time"><input type="datetime-local" value={form.visitAt} onChange={set("visitAt")} className={field} /></Field>
            <Field label="Doctor"><input value={form.doctor} onChange={set("doctor")} placeholder="Dr. A. Rao" className={field} /></Field>
            <Field label="Department"><input value={form.department} onChange={set("department")} placeholder="Internal Medicine" className={field} /></Field>
            <Field label="Where"><input value={form.location} onChange={set("location")} placeholder="Hospital, block, room" className={field} /></Field>
            <Field label="Bring to your visit (one per line)">
              <textarea value={form.checklist} onChange={set("checklist")} rows={3} className={`${field} h-auto py-2`} />
            </Field>
          </div>

          <div className="mc-patient-card flex flex-col gap-3">
            <ListHeader title="Emergency contact" />
            <Field label="Name"><input value={form.contactName} onChange={set("contactName")} className={field} /></Field>
            <Field label="Relation"><input value={form.contactRelation} onChange={set("contactRelation")} placeholder="son, daughter, spouse…" className={field} /></Field>
            <Field label="Phone"><input type="tel" value={form.contactPhone} onChange={set("contactPhone")} className={field} autoComplete="tel" /></Field>
          </div>

          <button disabled={saving} className="h-12 rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <div className="flex justify-between text-[13px]">
            <button type="button" onClick={signOut} className="text-blue-600">Sign out</button>
            {!isPatientAndroid() && <Link to="/" className="text-blue-600">Clinician app</Link>}
          </div>
          <PatientDownload />
        </form>
      </Body>
    </>
  );
}
