package com.medicluster.patient;

import android.app.*;
import android.content.*;
import java.time.*;

/** Explicit alarm intents and OS restore events only; never exported to other apps. */
public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String key=intent.getStringExtra("key");
        if ("com.medicluster.patient.MEDICINE".equals(intent.getAction()) && key!=null && ReminderAlarms.enabled(context)) {
            try {
                Instant now=Instant.now();
                for (ReminderSchedule.Occurrence occurrence : ReminderSchedule.upcoming(ReminderStore.parse(ReminderStore.read(context)),now.minusSeconds(24*60*60),ZoneId.systemDefault())) {
                    if (!key.equals(Long.toString(occurrence.at)) || occurrence.at>now.toEpochMilli()) continue;
                    Intent open=new Intent(context,MainActivity.class).setAction("com.medicluster.patient.OPEN_REMINDERS")
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    PendingIntent tap=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                    Notification notification=new Notification.Builder(context,ReminderAlarms.CHANNEL)
                            .setSmallIcon(com.medicluster.patient.R.drawable.ic_patient)
                            .setContentTitle("Medicine reminder")
                            .setContentText(occurrence.medicine.name + (occurrence.medicine.dosage.isEmpty()?"":" · "+occurrence.medicine.dosage))
                            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(tap).setAutoCancel(true)
                            .setColor(0xff567769).build();
                    context.getSystemService(NotificationManager.class).notify(occurrence.key,0,notification);
                }
            } catch (Exception ignored) { /* A corrupt or signed-out schedule must not notify. */ }
        }
        ReminderAlarms.reschedule(context);
    }
}
