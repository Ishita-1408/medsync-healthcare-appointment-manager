import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, getBookingConfirmationTemplate, getMedicationReminderTemplate } from '../src/services/emailService.js';
import { config } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

async function diagnoseEmailPipeline() {
  console.log('\n================================================================');
  console.log('  MedSync Email Notification System End-to-End Diagnostic');
  console.log('================================================================\n');

  console.log('1. ENVIRONMENT & SECRETS:');
  console.log(`- Supabase URL: ${config.supabase.url ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`- Supabase Anon Key: ${config.supabase.anonKey ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`- Resend API Key: ${config.email.resendApiKey ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`- Email Provider: ${config.email.provider}`);
  console.log(`- Email From: ${config.email.from}`);

  console.log('\n2. TESTING RPC AVAILABILITY:');
  
  // Test claim_next_email_job RPC
  try {
    const { data: claimRes, error: claimErr } = await supabase.rpc('claim_next_email_job', {
      p_worker_id: 'diag_worker_1',
    });
    console.log(`- claim_next_email_job RPC: ${claimErr ? 'ERROR: ' + claimErr.message : 'AVAILABLE (Returned ' + claimRes.length + ' pending jobs)'}`);
  } catch (err) {
    console.log(`- claim_next_email_job RPC Exception: ${err.message}`);
  }

  // Test dispatch_due_medication_reminders RPC
  try {
    const { data: dispRes, error: dispErr } = await supabase.rpc('dispatch_due_medication_reminders');
    console.log(`- dispatch_due_medication_reminders RPC: ${dispErr ? 'ERROR: ' + dispErr.message : 'AVAILABLE (Dispatched ' + dispRes + ' reminders)'}`);
  } catch (err) {
    console.log(`- dispatch_due_medication_reminders RPC Exception: ${err.message}`);
  }

  console.log('\n3. TESTING BOOKING CONFIRMATION EMAIL GENERATION & DISPATCH:');
  const testPatientEmail = 'ishitamdps@gmail.com';
  const testDoctorName = 'Dr. Sarah Connor';
  const testPatientName = 'Mia Greene';

  const bookingTemplate = getBookingConfirmationTemplate({
    patientName: testPatientName,
    doctorName: testDoctorName,
    doctorSpecialty: 'Cardiology',
    dateStr: 'August 28, 2026',
    timeStr: '10:00 AM UTC',
    role: 'PATIENT',
  });

  console.log(`Generated Subject: "${bookingTemplate.subject}"`);
  console.log(`Attempting live Resend dispatch to verified recipient: ${testPatientEmail}...`);

  try {
    const bookingRes = await sendEmail({
      to: testPatientEmail,
      subject: bookingTemplate.subject,
      html: bookingTemplate.html,
      text: bookingTemplate.text,
    });
    console.log('\x1b[32m%s\x1b[0m', `✓ Booking Email Sent Successfully! Provider ID: ${bookingRes.messageId}`);
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', `✗ Booking Email Dispatch Failed: ${err.message}`);
  }

  console.log('\n4. TESTING MEDICATION REMINDER EMAIL GENERATION & DISPATCH:');
  const reminderTemplate = getMedicationReminderTemplate({
    patientName: testPatientName,
    medicationName: 'Unienzyme 500 mg',
    dosage: '1 tablet',
    frequency: 'Twice daily',
    instructions: 'Take after meals with water',
  });

  console.log(`Generated Subject: "${reminderTemplate.subject}"`);
  console.log(`Attempting live Resend dispatch to verified recipient: ${testPatientEmail}...`);

  try {
    const reminderRes = await sendEmail({
      to: testPatientEmail,
      subject: reminderTemplate.subject,
      html: reminderTemplate.html,
      text: reminderTemplate.text,
    });
    console.log('\x1b[32m%s\x1b[0m', `✓ Medication Reminder Email Sent Successfully! Provider ID: ${reminderRes.messageId}`);
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', `✗ Medication Reminder Dispatch Failed: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log('  Diagnostic Complete');
  console.log('================================================================\n');
}

diagnoseEmailPipeline();
