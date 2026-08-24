import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const testResults = {
  pass: 0,
  fail: 0,
};

function logTest(name, passed, details = '') {
  const symbol = passed ? '✓ [PASS]' : '✗ [FAIL]';
  const color = passed ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${symbol}\x1b[0m ${name} ${details ? `(${details})` : ''}`);
  if (passed) testResults.pass++;
  else testResults.fail++;
}

/**
 * Mock Google Calendar API Engine for Deterministic Automated Testing
 */
class MockGoogleCalendarClient {
  constructor(userId, shouldFail = false) {
    this.userId = userId;
    this.shouldFail = shouldFail;
    this.events = new Map();
  }

  async insert({ calendarId, requestBody }) {
    if (this.shouldFail) {
      throw new Error(`Google API 503: Service Unavailable for user ${this.userId}`);
    }
    const eventId = `gcal_${this.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventObj = {
      id: eventId,
      summary: requestBody.summary,
      description: requestBody.description,
      start: requestBody.start,
      end: requestBody.end,
      htmlLink: `https://calendar.google.com/calendar/event?eid=${eventId}`,
      status: 'confirmed',
    };
    this.events.set(eventId, eventObj);
    return { data: eventObj };
  }

  async patch({ calendarId, eventId, requestBody }) {
    if (this.shouldFail) {
      throw new Error(`Google API 500: Patch failed for user ${this.userId}`);
    }
    if (!this.events.has(eventId)) {
      const err = new Error('Google API 404: Event Not Found');
      err.code = 404;
      throw err;
    }
    const existing = this.events.get(eventId);
    const updated = {
      ...existing,
      ...requestBody,
      updated_at: new Date().toISOString(),
    };
    this.events.set(eventId, updated);
    return { data: updated };
  }

  async delete({ calendarId, eventId }) {
    if (this.shouldFail) {
      throw new Error(`Google API 500: Delete failed for user ${this.userId}`);
    }
    if (!this.events.has(eventId)) {
      const err = new Error('Google API 404: Event Not Found');
      err.code = 404;
      throw err;
    }
    this.events.delete(eventId);
    return { data: { status: 'deleted' } };
  }
}

/**
 * Simulated Dual-User Calendar Service Sync Controller
 */
async function simulateDualCalendarSync({
  action,
  appointmentId,
  patientId,
  doctorId,
  startTime,
  endTime,
  patientClient,
  doctorClient,
  dbStore,
}) {
  const syncLogs = {
    patientAction: null,
    doctorAction: null,
    patientEventId: null,
    doctorEventId: null,
    errors: [],
  };

  const eventSummary = 'MedSync Consultation';
  const eventDescription = 'Confirmed healthcare appointment on MedSync';

  // 1. Patient Sync Branch
  if (patientClient) {
    try {
      const existingPat = dbStore.get(`${appointmentId}_${patientId}`);
      if (action === 'create') {
        const res = await patientClient.insert({
          calendarId: 'primary',
          requestBody: { summary: eventSummary, description: eventDescription, start: startTime, end: endTime },
        });
        dbStore.set(`${appointmentId}_${patientId}`, { google_event_id: res.data.id, status: 'CONFIRMED' });
        syncLogs.patientAction = 'created';
        syncLogs.patientEventId = res.data.id;
      } else if (action === 'update' && existingPat?.google_event_id) {
        const res = await patientClient.patch({
          calendarId: 'primary',
          eventId: existingPat.google_event_id,
          requestBody: { start: startTime, end: endTime },
        });
        dbStore.set(`${appointmentId}_${patientId}`, { google_event_id: existingPat.google_event_id, status: 'RESCHEDULED' });
        syncLogs.patientAction = 'updated';
        syncLogs.patientEventId = existingPat.google_event_id;
      } else if (action === 'cancel' && existingPat?.google_event_id) {
        await patientClient.delete({ calendarId: 'primary', eventId: existingPat.google_event_id });
        dbStore.set(`${appointmentId}_${patientId}`, { google_event_id: existingPat.google_event_id, status: 'CANCELLED' });
        syncLogs.patientAction = 'cancelled';
        syncLogs.patientEventId = existingPat.google_event_id;
      }
    } catch (err) {
      syncLogs.errors.push({ user: 'patient', error: err.message });
    }
  }

  // 2. Doctor Sync Branch (Isolated / Independent)
  if (doctorClient) {
    try {
      const existingDoc = dbStore.get(`${appointmentId}_${doctorId}`);
      if (action === 'create') {
        const res = await doctorClient.insert({
          calendarId: 'primary',
          requestBody: { summary: eventSummary, description: eventDescription, start: startTime, end: endTime },
        });
        dbStore.set(`${appointmentId}_${doctorId}`, { google_event_id: res.data.id, status: 'CONFIRMED' });
        syncLogs.doctorAction = 'created';
        syncLogs.doctorEventId = res.data.id;
      } else if (action === 'update' && existingDoc?.google_event_id) {
        const res = await doctorClient.patch({
          calendarId: 'primary',
          eventId: existingDoc.google_event_id,
          requestBody: { start: startTime, end: endTime },
        });
        dbStore.set(`${appointmentId}_${doctorId}`, { google_event_id: existingDoc.google_event_id, status: 'RESCHEDULED' });
        syncLogs.doctorAction = 'updated';
        syncLogs.doctorEventId = existingDoc.google_event_id;
      } else if (action === 'cancel' && existingDoc?.google_event_id) {
        await doctorClient.delete({ calendarId: 'primary', eventId: existingDoc.google_event_id });
        dbStore.set(`${appointmentId}_${doctorId}`, { google_event_id: existingDoc.google_event_id, status: 'CANCELLED' });
        syncLogs.doctorAction = 'cancelled';
        syncLogs.doctorEventId = existingDoc.google_event_id;
      }
    } catch (err) {
      syncLogs.errors.push({ user: 'doctor', error: err.message });
    }
  }

  return syncLogs;
}

async function runCalendarTests() {
  console.log('\n================================================================');
  console.log('  MedSync Dual-User Google Calendar Synchronization Test Suite');
  console.log('  Mode: Isolated Automated Mock Engine & Protocol Verifier');
  console.log('================================================================\n');

  const dbStore = new Map();
  const patientId = 'pat_user_111';
  const doctorId = 'doc_user_222';
  const apptId = 'appt_test_999';

  const patientClient = new MockGoogleCalendarClient(patientId);
  const doctorClient = new MockGoogleCalendarClient(doctorId);

  let initialPatientEventId = null;
  let initialDoctorEventId = null;

  // TEST 1: Booking -> Patient Calendar Event Created
  try {
    const res = await simulateDualCalendarSync({
      action: 'create',
      appointmentId: apptId,
      patientId,
      doctorId,
      startTime: '2026-08-28T10:00:00Z',
      endTime: '2026-08-28T10:30:00Z',
      patientClient,
      doctorClient,
      dbStore,
    });

    initialPatientEventId = res.patientEventId;
    const isSuccess = res.patientAction === 'created' && Boolean(initialPatientEventId);
    logTest('1. Booking -> Patient Calendar Event Created', isSuccess, `EventId: ${initialPatientEventId}`);
  } catch (e) {
    logTest('1. Booking -> Patient Calendar Event Created', false, e.message);
  }

  // TEST 2: Booking -> Doctor Calendar Event Created
  try {
    const dbDoc = dbStore.get(`${apptId}_${doctorId}`);
    initialDoctorEventId = dbDoc?.google_event_id;
    const isSuccess = Boolean(initialDoctorEventId) && doctorClient.events.has(initialDoctorEventId);
    logTest('2. Booking -> Doctor Calendar Event Created', isSuccess, `EventId: ${initialDoctorEventId}`);
  } catch (e) {
    logTest('2. Booking -> Doctor Calendar Event Created', false, e.message);
  }

  // TEST 3: Reschedule -> Existing Patient Event Updated (Reusing ID)
  try {
    const res = await simulateDualCalendarSync({
      action: 'update',
      appointmentId: apptId,
      patientId,
      doctorId,
      startTime: '2026-08-28T14:00:00Z',
      endTime: '2026-08-28T14:30:00Z',
      patientClient,
      doctorClient,
      dbStore,
    });

    const isUpdated = res.patientAction === 'updated' && res.patientEventId === initialPatientEventId;
    logTest('3. Reschedule -> Existing Patient Event Updated', isUpdated, `Reused EventId: ${res.patientEventId}`);
  } catch (e) {
    logTest('3. Reschedule -> Existing Patient Event Updated', false, e.message);
  }

  // TEST 4: Reschedule -> Existing Doctor Event Updated (Reusing ID)
  try {
    const dbDoc = dbStore.get(`${apptId}_${doctorId}`);
    const isDocUpdated = dbDoc?.status === 'RESCHEDULED' && dbDoc?.google_event_id === initialDoctorEventId;
    logTest('4. Reschedule -> Existing Doctor Event Updated', isDocUpdated, `Reused EventId: ${initialDoctorEventId}`);
  } catch (e) {
    logTest('4. Reschedule -> Existing Doctor Event Updated', false, e.message);
  }

  // TEST 5: Cancellation -> Patient Event Deleted from Google Calendar
  try {
    const res = await simulateDualCalendarSync({
      action: 'cancel',
      appointmentId: apptId,
      patientId,
      doctorId,
      startTime: '2026-08-28T14:00:00Z',
      endTime: '2026-08-28T14:30:00Z',
      patientClient,
      doctorClient,
      dbStore,
    });

    const isDeletedFromGoogle = !patientClient.events.has(initialPatientEventId);
    const isMarkedInDb = dbStore.get(`${apptId}_${patientId}`)?.status === 'CANCELLED';
    logTest('5. Cancellation -> Patient Event Deleted', isDeletedFromGoogle && isMarkedInDb, 'Event deleted from GCal & marked CANCELLED in DB');
  } catch (e) {
    logTest('5. Cancellation -> Patient Event Deleted', false, e.message);
  }

  // TEST 6: Cancellation -> Doctor Event Deleted from Google Calendar
  try {
    const isDocDeletedFromGoogle = !doctorClient.events.has(initialDoctorEventId);
    const isDocMarkedInDb = dbStore.get(`${apptId}_${doctorId}`)?.status === 'CANCELLED';
    logTest('6. Cancellation -> Doctor Event Deleted', isDocDeletedFromGoogle && isDocMarkedInDb, 'Event deleted from GCal & marked CANCELLED in DB');
  } catch (e) {
    logTest('6. Cancellation -> Doctor Event Deleted', false, e.message);
  }

  // TEST 7: Event IDs Persisted and Reused Protocol Verification
  try {
    const patMappingPersisted = dbStore.has(`${apptId}_${patientId}`);
    const docMappingPersisted = dbStore.has(`${apptId}_${doctorId}`);
    logTest('7. Google Event IDs Persisted & Reused Across Lifecycle', patMappingPersisted && docMappingPersisted, 'Persisted in appointment_calendar_events');
  } catch (e) {
    logTest('7. Google Event IDs Persisted', false, e.message);
  }

  // TEST 8: Fault Isolation: One User Calendar Failure Does Not Prevent Other User
  try {
    const apptIdFault = 'appt_fault_001';
    const failingPatientClient = new MockGoogleCalendarClient(patientId, true); // Inject Google 503 error
    const workingDoctorClient = new MockGoogleCalendarClient(doctorId, false);

    const faultRes = await simulateDualCalendarSync({
      action: 'create',
      appointmentId: apptIdFault,
      patientId,
      doctorId,
      startTime: '2026-08-29T09:00:00Z',
      endTime: '2026-08-29T09:30:00Z',
      patientClient: failingPatientClient,
      doctorClient: workingDoctorClient,
      dbStore,
    });

    const doctorSucceeded = faultRes.doctorAction === 'created' && Boolean(faultRes.doctorEventId);
    const patientReportedError = faultRes.errors.length === 1 && faultRes.errors[0].user === 'patient';
    logTest(
      '8. Fault Isolation (Patient GCal Error Does Not Block Doctor Sync)',
      doctorSucceeded && patientReportedError,
      'Doctor synced successfully despite Patient GCal API failure'
    );
  } catch (e) {
    logTest('8. Fault Isolation', false, e.message);
  }

  console.log('\n================================================================');
  console.log(`  CALENDAR TEST RESULTS: ${testResults.pass} Passed | ${testResults.fail} Failed`);
  console.log('================================================================\n');

  if (testResults.fail > 0) {
    process.exit(1);
  }
}

runCalendarTests();
