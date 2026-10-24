package com.medicluster.patient;

import org.junit.Test;
import java.time.*;
import java.util.*;
import static org.junit.Assert.*;

public class ReminderScheduleTest {
    private ReminderSchedule.Medicine medicine(String frequency, boolean active, Set<String> days, List<String> times, Set<String> taken) {
        return new ReminderSchedule.Medicine("med-1","Medicine","10 mg",frequency,active,days,times,taken);
    }
    private List<ReminderSchedule.Occurrence> next(ReminderSchedule.Medicine value, String now, String zone) {
        return ReminderSchedule.upcoming(Collections.singletonList(value),Instant.parse(now),ZoneId.of(zone));
    }
    @Test public void completedDoseAndPastTimesAreExcludedAndDailyScheduleContinues() {
        ReminderSchedule.Medicine value=medicine("daily",true,Set.of(),List.of("08:00","20:00"),Set.of("2026-10-24:20:00"));
        List<ReminderSchedule.Occurrence> result=next(value,"2026-10-24T12:00:00Z","UTC");
        assertEquals(14,result.size());
        assertEquals(Instant.parse("2026-10-25T08:00:00Z").toEpochMilli(),result.get(0).at);
    }
    @Test public void weeklyUsesLocalWeekdayAndDate() {
        ReminderSchedule.Medicine value=medicine("weekly",true,Set.of("Sun"),List.of("08:00"),Set.of());
        List<ReminderSchedule.Occurrence> result=next(value,"2026-10-24T23:00:00Z","Asia/Kolkata");
        assertEquals(2,result.size());
        assertEquals(Instant.parse("2026-10-25T02:30:00Z").toEpochMilli(),result.get(0).at);
    }
    @Test public void inactiveAndAsNeededDoNotSchedule() {
        assertTrue(next(medicine("daily",false,Set.of(),List.of("08:00"),Set.of()),"2026-10-24T00:00:00Z","UTC").isEmpty());
        assertTrue(next(medicine("as-needed",true,Set.of(),List.of("08:00"),Set.of()),"2026-10-24T00:00:00Z","UTC").isEmpty());
    }
    @Test public void duplicateTimesProduceOneOccurrence() {
        assertEquals(8,next(medicine("daily",true,Set.of(),List.of("08:00","08:00"),Set.of()),"2026-10-24T00:00:00Z","UTC").size());
    }
    @Test public void dstGapDoesNotShiftMedicineToDifferentClockTime() {
        List<ReminderSchedule.Occurrence> result=next(medicine("daily",true,Set.of(),List.of("02:30"),Set.of()),"2026-03-08T05:00:00Z","America/New_York");
        assertEquals(7,result.size());
        assertEquals(Instant.parse("2026-03-09T06:30:00Z").toEpochMilli(),result.get(0).at);
    }
    @Test(expected=IllegalArgumentException.class) public void invalidTimeRejected() {
        medicine("daily",true,Set.of(),List.of("24:01"),Set.of());
    }
    @Test(expected=IllegalArgumentException.class) public void unboundedTimesRejected() {
        medicine("daily",true,Set.of(),Collections.nCopies(13,"08:00"),Set.of());
    }
    @Test public void emptySnapshotCancelsAllOccurrences() {
        assertTrue(ReminderSchedule.upcoming(List.of(),Instant.now(),ZoneId.of("UTC")).isEmpty());
    }
}
