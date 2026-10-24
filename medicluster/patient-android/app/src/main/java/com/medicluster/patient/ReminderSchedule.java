package com.medicluster.patient;

import java.time.*;
import java.util.*;

/** Calendar rules independent of Android; all occurrences use the device's local timezone. */
final class ReminderSchedule {
    static final int MAX_REMINDERS = 100;
    static final int MAX_TIMES = 12;
    static final class Medicine {
        final String id, name, dosage, frequency;
        final boolean active;
        final Set<String> days, taken;
        final List<String> times;
        Medicine(String id, String name, String dosage, String frequency, boolean active,
                 Set<String> days, List<String> times, Set<String> taken) {
            if (id == null || id.isEmpty() || id.length() > 128 || name == null || name.isEmpty()
                    || name.length() > 160 || dosage.length() > 160 || times.size() > MAX_TIMES
                    || !Arrays.asList("daily", "weekly", "as-needed").contains(frequency))
                throw new IllegalArgumentException("Invalid medicine");
            for (String time : times) {
                if (!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new IllegalArgumentException("Invalid time");
            }
            this.id=id; this.name=name; this.dosage=dosage; this.frequency=frequency;
            this.active=active; this.days=days; this.times=times; this.taken=taken;
        }
    }
    static final class Occurrence {
        final Medicine medicine;
        final long at;
        final String key;
        Occurrence(Medicine medicine, ZonedDateTime date, String time) {
            this.medicine=medicine; this.at=date.toInstant().toEpochMilli();
            this.key=medicine.id + ":" + date.toLocalDate() + ":" + time;
        }
    }
    static List<Occurrence> upcoming(List<Medicine> medicines, Instant now, ZoneId zone) {
        if (medicines.size() > MAX_REMINDERS) throw new IllegalArgumentException("Too many medicines");
        List<Occurrence> result = new ArrayList<>();
        String[] days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
        LocalDate start=now.atZone(zone).toLocalDate();
        Set<String> keys = new HashSet<>();
        for (Medicine medicine : medicines) {
            if (!medicine.active || medicine.frequency.equals("as-needed")) continue;
            for (int day=0; day<8; day++) {
                LocalDate date=start.plusDays(day);
                if (medicine.frequency.equals("weekly") && !medicine.days.contains(days[date.getDayOfWeek().getValue()-1])) continue;
                for (String time : medicine.times) {
                    if (medicine.taken.contains(date + ":" + time)) continue;
                    ZonedDateTime due=date.atTime(LocalTime.parse(time)).atZone(zone);
                    // A nonexistent spring-forward clock time has no dose slot that day.
                    if (!due.toLocalTime().equals(LocalTime.parse(time)) || !due.toInstant().isAfter(now)) continue;
                    Occurrence item=new Occurrence(medicine, due, time);
                    if (keys.add(item.key)) result.add(item);
                }
            }
        }
        result.sort(Comparator.comparingLong(item -> item.at));
        return result;
    }
}
