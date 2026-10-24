package com.medicluster.patient;

import org.junit.Test;
import org.json.JSONException;
import static org.junit.Assert.*;

public class ReminderStoreTest {
    private String snapshot(String row) { return "{\"patientId\":\"patient-1\",\"reminders\":["+row+"]}"; }
    private String row() { return "{\"_id\":\"med-1\",\"medicationName\":\"Medicine\",\"dosage\":\"1 tablet\",\"frequency\":\"daily\",\"active\":true,\"times\":[\"08:00\"],\"days\":[],\"doseLog\":[{\"date\":\"2026-10-24\",\"time\":\"08:00\"}]}"; }
    @Test public void readsBoundedMedicineAndCompletedDose() throws Exception {
        ReminderSchedule.Medicine value=ReminderStore.parse(snapshot(row())).get(0);
        assertEquals("Medicine",value.name);
        assertTrue(value.taken.contains("2026-10-24:08:00"));
    }
    @Test public void logoutSnapshotHasNoMedicines() throws Exception {
        assertTrue(ReminderStore.parse("{\"patientId\":\"\",\"reminders\":[]}").isEmpty());
    }
    @Test(expected=JSONException.class) public void missingPatientRejected() throws Exception { ReminderStore.parse("{\"reminders\":[]}"); }
    @Test(expected=JSONException.class) public void signedOutMedicineRejected() throws Exception { ReminderStore.parse(snapshot(row()).replace("patient-1","")); }
    @Test(expected=JSONException.class) public void duplicateIdsRejected() throws Exception { ReminderStore.parse(snapshot(row()+","+row())); }
    @Test(expected=JSONException.class) public void invalidClockRejected() throws Exception { ReminderStore.parse(snapshot(row().replace("08:00","25:00"))); }
    @Test(expected=JSONException.class) public void malformedDayRejected() throws Exception { ReminderStore.parse(snapshot(row().replace("\"days\":[]","\"days\":[\"Funday\"]"))); }
    @Test(expected=JSONException.class) public void oversizedSnapshotRejectedBeforeParsing() throws Exception { ReminderStore.parse("x".repeat(ReminderStore.MAX_BYTES+1)); }
    @Test(expected=JSONException.class) public void tooManyMedicinesRejected() throws Exception { ReminderStore.parse(snapshot(String.join(",",java.util.Collections.nCopies(101,row())))); }
}
