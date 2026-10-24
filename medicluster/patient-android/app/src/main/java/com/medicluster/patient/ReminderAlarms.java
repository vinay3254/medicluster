package com.medicluster.patient;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.*;
import java.time.*;
import java.util.*;

final class ReminderAlarms {
    static final String CHANNEL="medicine-reminders";
    static final int REFRESH=10000;
    static final int LIMIT=400;
    static PendingIntent pending(Context context, int id, String key) {
        Intent intent=new Intent(context,ReminderReceiver.class).setAction("com.medicluster.patient.MEDICINE");
        if (key!=null) intent.putExtra("key",key);
        return PendingIntent.getBroadcast(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static boolean enabled(Context context) {
        return (Build.VERSION.SDK_INT<33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
                && context.getSystemService(NotificationManager.class).areNotificationsEnabled()
                && (context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL)==null
                    || context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE);
    }
    static boolean exact(Context context) {
        return Build.VERSION.SDK_INT<31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }
    static synchronized int reschedule(Context context) {
        NotificationManager notifications=context.getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL,"Medicine reminders",NotificationManager.IMPORTANCE_HIGH));
        AlarmManager alarms=context.getSystemService(AlarmManager.class);
        int previous=context.getSharedPreferences("medicine-reminders",0).getInt("alarmCount",LIMIT);
        for(int i=0;i<previous;i++) alarms.cancel(pending(context,i,null));
        alarms.cancel(pending(context,REFRESH,null));
        int count=0;
        try {
            List<ReminderSchedule.Medicine> medicines=ReminderStore.parse(ReminderStore.read(context));
            List<ReminderSchedule.Occurrence> upcoming=ReminderSchedule.upcoming(medicines,Instant.now(),ZoneId.systemDefault());
            Set<Long> scheduledTimes=new HashSet<>();
            if (enabled(context)) for(ReminderSchedule.Occurrence occurrence:upcoming) {
                if (!scheduledTimes.add(occurrence.at)) continue;
                if (count>=LIMIT) break;
                PendingIntent operation=pending(context,count++,Long.toString(occurrence.at));
                if (exact(context)) {
                    try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,occurrence.at,operation); }
                    catch (SecurityException e) { alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,occurrence.at,operation); }
                } else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,occurrence.at,operation);
            }
            if (!medicines.isEmpty()) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis()+12*60*60*1000L,pending(context,REFRESH,null));
            else notifications.cancelAll();
        } catch (JSONException | IllegalArgumentException e) { notifications.cancelAll(); }
        context.getSharedPreferences("medicine-reminders",0).edit().putInt("alarmCount",count).apply();
        return count;
    }
    static JSONObject status(Context context, String error) {
        JSONObject result=new JSONObject();
        try {
            result.put("supported",true).put("notificationsEnabled",enabled(context)).put("exactAlarms",exact(context))
                .put("scheduledCount",context.getSharedPreferences("medicine-reminders",0).getInt("alarmCount",0));
            if(error!=null) result.put("error",error);
        } catch(JSONException ignored) { }
        return result;
    }
}
