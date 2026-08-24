import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../src/services/emailService.js';
import { config } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

async function runLiveReminderAudit() {
  console.log('\n================================================================');
  console.log('  MedSync Real Live Execution & Database State Audit');
  console.log('================================================================\n');

  console.log('--- 1. CONFIGURATION & SECRETS CHECK ---');
  console.log(`SUPABASE_URL: ${config.supabase.url ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`SUPABASE_ANON_KEY: ${config.supabase.anonKey ? 'CONFIGURED' : 'MISSING'}`);
  console.log(`RESEND_API_KEY: ${config.email.resendApiKey ? 'CONFIGURED (re_...)' : 'MISSING'}`);
  console.log(`EMAIL_FROM: ${config.email.from}`);

  console.log('\n--- 2. REAL DATABASE OBJECTS QUERY ---');
  
  // 1. Profiles
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, first_name, last_name, role');
  console.log(`Profiles found: ${profiles?.length || 0}`, pErr ? `(Error: ${pErr.message})` : '');
  if (profiles && profiles.length > 0) {
    console.log(JSON.stringify(profiles, null, 2));
  }

  // 2. Prescriptions
  const { data: prescriptions, error: rxErr } = await supabase
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .order('created_at', { ascending: false });

  console.log(`\nPrescriptions found: ${prescriptions?.length || 0}`, rxErr ? `(Error: ${rxErr.message})` : '');
  if (prescriptions && prescriptions.length > 0) {
    console.log(JSON.stringify(prescriptions, null, 2));
  }

  // 3. Medication Reminders Table
  const { data: reminders, error: remErr } = await supabase
    .from('medication_reminders')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`\nMedication reminders found: ${reminders?.length || 0}`, remErr ? `(Error: ${remErr.message})` : '');
  if (reminders && reminders.length > 0) {
    console.log(JSON.stringify(reminders, null, 2));
  }

  // 4. Email Jobs Table
  const { data: jobs, error: jobErr } = await supabase
    .from('email_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`\nEmail jobs found (last 10): ${jobs?.length || 0}`, jobErr ? `(Error: ${jobErr.message})` : '');
  if (jobs && jobs.length > 0) {
    console.log(JSON.stringify(jobs, null, 2));
  }

  // 5. In-App Notifications Table
  const { data: notifs, error: notifErr } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`\nIn-app notifications found (last 10): ${notifs?.length || 0}`, notifErr ? `(Error: ${notifErr.message})` : '');
  if (notifs && notifs.length > 0) {
    console.log(JSON.stringify(notifs, null, 2));
  }

  console.log('\n--- 3. TEST REAL RESEND DISPATCH TO VERIFIED RECIPIENT ---');
  const targetRecipient = 'ishitamdps@gmail.com';
  console.log(`Attempting real transactional email delivery to verified sandbox recipient: ${targetRecipient}`);
  
  try {
    const res = await sendEmail({
      to: targetRecipient,
      subject: 'MedSync Medication Reminder Test — Live Verification',
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #14b8a6; border-radius: 8px;">
          <h2 style="color: #0f766e;">MedSync Live Medication Reminder</h2>
          <p>This is a live transactional delivery verification from the MedSync clinical system.</p>
          <p><strong>Medicine:</strong> Unienzyme 500 mg</p>
          <p><strong>Dose:</strong> 1 tablet (Oral)</p>
          <p><strong>Schedule:</strong> 08:00 AM (Morning) & 08:00 PM (Night)</p>
          <p><strong>Instructions:</strong> Take after meals</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
          <small style="color: #64748b;">Timestamp: ${new Date().toISOString()}</small>
        </div>
      `,
      text: 'MedSync Live Medication Reminder: Unienzyme 500 mg (1 tablet after meals).',
    });

    console.log('\x1b[32m%s\x1b[0m', `✓ [REAL PROVIDER SUCCESS] Resend accepted delivery. Message ID: ${res.messageId}`);
  } catch (emailErr) {
    console.log('\x1b[31m%s\x1b[0m', `✗ [REAL PROVIDER ERROR]: ${emailErr.message}`);
  }

  console.log('\n================================================================');
  console.log('  Live Audit Complete');
  console.log('================================================================\n');
}

runLiveReminderAudit();
