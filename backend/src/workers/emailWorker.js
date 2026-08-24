import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import {
  sendEmail,
  getBookingConfirmationTemplate,
  getReminder24hTemplate,
  getReminder2hTemplate,
  getCancellationTemplate,
  getMedicationReminderTemplate,
  getPrescriptionReadyTemplate,
} from '../services/emailService.js';



const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

const WORKER_ID = `worker_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240]; // Exponential backoff intervals

let isRunning = false;
let workerTimer = null;

/**
 * Process a single claimed email job
 */
async function processJob(job) {
  try {
    const payload = job.payload || {};
    let templateData;

    const role = payload.role || 'PATIENT';

    switch (job.email_type) {
      case 'BOOKING_CONFIRMATION':
        templateData = getBookingConfirmationTemplate({
          patientName: payload.patient_name || job.recipient_name || 'Patient',
          doctorName: payload.doctor_name || 'Physician',
          doctorSpecialty: payload.doctor_specialty || 'General Practitioner',
          dateStr: payload.date_str || 'Scheduled Date',
          timeStr: payload.time_str || 'Scheduled Time',
          role,
        });
        break;

      case 'APPOINTMENT_REMINDER_24H':
        templateData = getReminder24hTemplate({
          patientName: payload.patient_name || job.recipient_name || 'Patient',
          doctorName: payload.doctor_name || 'Physician',
          doctorSpecialty: payload.doctor_specialty || 'General Practitioner',
          dateStr: payload.date_str || 'Tomorrow',
          timeStr: payload.time_str || 'Scheduled Time',
          role,
        });
        break;

      case 'APPOINTMENT_REMINDER_2H':
        templateData = getReminder2hTemplate({
          patientName: payload.patient_name || job.recipient_name || 'Patient',
          doctorName: payload.doctor_name || 'Physician',
          doctorSpecialty: payload.doctor_specialty || 'General Practitioner',
          dateStr: payload.date_str || 'Today',
          timeStr: payload.time_str || 'Scheduled Time',
          role,
        });
        break;

      case 'APPOINTMENT_CANCELLATION':
        templateData = getCancellationTemplate({
          patientName: payload.patient_name || job.recipient_name || 'Patient',
          doctorName: payload.doctor_name || 'Physician',
          doctorSpecialty: payload.doctor_specialty || 'General Practitioner',
          dateStr: payload.date_str || 'Original Date',
          timeStr: payload.time_str || 'Original Time',
          role,
        });
        break;

      case 'MEDICATION_REMINDER':
        templateData = getMedicationReminderTemplate({
          patientName: job.recipient_name || payload.patient_name || 'Patient',
          medicationName: payload.medication_name || 'Prescribed Medication',
          dosage: payload.dosage || 'As directed',
          frequency: payload.frequency || 'Daily',
          instructions: payload.instructions || 'Take as instructed',
        });
        break;


      case 'PRESCRIPTION_READY':
        templateData = getPrescriptionReadyTemplate({
          patientName: job.recipient_name || payload.patient_name || 'Patient',
          doctorName: payload.doctor_name || 'Physician',
          dateStr: payload.date_str || 'Recent Visit',
          medications: payload.medications || [],
          notes: payload.notes || '',
        });
        break;

      default:
        throw new Error(`Unknown email_type: ${job.email_type}`);

    }

    // Send the email
    const sendResult = await sendEmail({
      to: job.recipient_email,
      subject: templateData.subject,
      html: templateData.html,
      text: templateData.text,
    });

    // Mark Job as SENT
    await supabaseAdmin
      .from('email_jobs')
      .update({
        status: 'SENT',
        sent_at: new Date().toISOString(),
        provider_message_id: sendResult.messageId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(
      '\x1b[32m%s\x1b[0m',
      `✓ [Email Worker] Sent ${job.email_type} to ${job.recipient_email} (ID: ${job.id})`
    );
  } catch (err) {
    console.error(`✗ [Email Worker Error] Failed processing job ${job.id}:`, err.message);

    const nextAttempts = (job.attempts || 0) + 1;
    const maxAttempts = job.max_attempts || 5;

    if (nextAttempts >= maxAttempts) {
      // Mark permanently FAILED
      await supabaseAdmin
        .from('email_jobs')
        .update({
          status: 'FAILED',
          attempts: nextAttempts,
          last_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    } else {
      // Compute exponential backoff delay
      const delayMin = RETRY_DELAYS_MINUTES[Math.min(nextAttempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
      const nextRetry = new Date(Date.now() + delayMin * 60 * 1000).toISOString();

      await supabaseAdmin
        .from('email_jobs')
        .update({
          status: 'RETRY',
          attempts: nextAttempts,
          next_retry_at: nextRetry,
          last_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    }
  }
}

let lastMedReminderDispatch = 0;

/**
 * Main worker polling cycle
 */
async function workerPollCycle() {
  if (!isRunning) return;

  const now = Date.now();
  // Periodically check and queue due medication reminders (every 60 seconds)
  if (now - lastMedReminderDispatch > 60000) {
    lastMedReminderDispatch = now;
    try {
      const { data: dispatchedCount, error: medErr } = await supabaseAdmin.rpc('dispatch_due_medication_reminders');
      if (!medErr && dispatchedCount > 0) {
        console.log(
          '\x1b[36m%s\x1b[0m',
          `💊 [Medication Reminders Engine] Dispatched ${dispatchedCount} due medication reminders.`
        );
      }
    } catch (err) {
      console.warn('[Medication Reminders Dispatch warning]:', err.message);
    }
  }

  try {
    // Claim next job via RPC
    const { data, error } = await supabaseAdmin.rpc('claim_next_email_job', {
      p_worker_id: WORKER_ID,
    });

    if (!error && data && data.length > 0) {
      const job = data[0];
      await processJob(job);
      // Immediately check if more jobs exist
      setImmediate(workerPollCycle);
      return;
    }
  } catch (err) {
    console.warn('[Email Worker Poll warning]:', err.message);
  }

  // Schedule next poll cycle if running
  if (isRunning) {
    workerTimer = setTimeout(workerPollCycle, 8000); // 8-second poll
  }
}

/**
 * Start the Background Email Worker
 */
export function startEmailWorker() {
  if (isRunning) return;
  isRunning = true;
  console.log(
    '\x1b[35m%s\x1b[0m',
    `⚡ [Background Email Worker] Initialized (Worker ID: ${WORKER_ID})`
  );
  workerPollCycle();
}

/**
 * Stop the Background Email Worker
 */
export function stopEmailWorker() {
  isRunning = false;
  if (workerTimer) clearTimeout(workerTimer);
  console.log('🛑 [Background Email Worker] Stopped.');
}
