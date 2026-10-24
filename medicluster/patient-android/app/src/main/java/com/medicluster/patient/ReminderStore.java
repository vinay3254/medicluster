package com.medicluster.patient;

import android.content.Context;
import org.json.*;
import java.util.*;

final class ReminderStore {
    static final int MAX_BYTES=262144;
    static List<ReminderSchedule.Medicine> parse(String value) throws JSONException {
        if (value == null || value.length() > MAX_BYTES || value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES) throw new JSONException("Schedule is too large");
        JSONObject root=new JSONObject(value);
        String patient=root.getString("patientId");
        if (!patient.matches("[A-Za-z0-9_-]{0,128}")) throw new JSONException("Invalid patient");
        JSONArray rows=root.getJSONArray("reminders");
        if (rows.length()>ReminderSchedule.MAX_REMINDERS || (patient.isEmpty() && rows.length()!=0)) throw new JSONException("Invalid schedule");
        List<ReminderSchedule.Medicine> result=new ArrayList<>();
        Set<String> ids=new HashSet<>();
        for (int i=0;i<rows.length();i++) {
            JSONObject row=rows.getJSONObject(i);
            String id=row.getString("_id");
            if (!ids.add(id)) throw new JSONException("Duplicate medicine");
            JSONArray times=row.getJSONArray("times"), days=row.optJSONArray("days"), logs=row.optJSONArray("doseLog");
            if (times.length()>12 || (days!=null && days.length()>7) || (logs!=null && logs.length()>1000)) throw new JSONException("Invalid limits");
            List<String> timeList=new ArrayList<>(); Set<String> daySet=new HashSet<>(), taken=new HashSet<>();
            for (int j=0;j<times.length();j++) timeList.add(times.getString(j));
            if (days!=null) for(int j=0;j<days.length();j++) {
                String day=days.getString(j);
                if (!Arrays.asList("Sun","Mon","Tue","Wed","Thu","Fri","Sat").contains(day)) throw new JSONException("Invalid day");
                daySet.add(day);
            }
            if (logs!=null) for(int j=0;j<logs.length();j++) {
                JSONObject log=logs.getJSONObject(j);
                String date=log.getString("date"), time=log.getString("time");
                if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || !time.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new JSONException("Invalid dose log");
                taken.add(date+":"+time);
            }
            try { result.add(new ReminderSchedule.Medicine(id,row.getString("medicationName"),row.optString("dosage",""),row.getString("frequency"),row.optBoolean("active",true),daySet,timeList,taken)); }
            catch (IllegalArgumentException e) { throw new JSONException(e.getMessage()); }
        }
        return result;
    }
    static String read(Context context) {
        return context.getSharedPreferences("medicine-reminders",0).getString("snapshot", "{\"patientId\":\"\",\"reminders\":[]}");
    }
    static void save(Context context, String value) throws JSONException {
        parse(value);
        if (!context.getSharedPreferences("medicine-reminders",0).edit().putString("snapshot",value).commit()) throw new JSONException("Could not save reminders");
    }
}
