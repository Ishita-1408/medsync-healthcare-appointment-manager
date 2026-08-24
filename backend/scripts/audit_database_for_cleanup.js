import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function runCompleteAudit() {
  console.log('================================================================');
  console.log('  MedSync Database Pre-Cleanup Audit (Read-Only)');
  console.log('================================================================\n');

  const tables = [
    'profiles',
    'patient_profiles',
    'doctor_profiles',
    'doctor_working_hours',
    'doctor_leaves',
    'appointments',
    'appointment_intakes',
    'consultation_notes',
    'prescriptions',
    'prescription_items',
    'notifications',
    'ai_pre_visit_summaries',
    'ai_post_visit_summaries',
    'email_jobs',
    'appointment_calendar_events',
    'user_calendar_tokens',
    'medication_reminders',
  ];

  const counts = {};
  const sampleRecords = {};

  // 1. Audit Auth Users
  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
      console.log('auth.users error:', authErr.message);
      counts['auth.users'] = 'Error: ' + authErr.message;
    } else {
      counts['auth.users'] = authData?.users?.length || 0;
      sampleRecords['auth.users'] = authData?.users?.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      })) || [];
    }
  } catch (e) {
    counts['auth.users'] = 'Exception: ' + e.message;
  }

  // 2. Audit Public Tables
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' });

      if (error) {
        counts[table] = 'Error: ' + error.message;
      } else {
        counts[table] = data?.length || 0;
        sampleRecords[table] = data || [];
      }
    } catch (e) {
      counts[table] = 'Exception: ' + e.message;
    }
  }

  console.log('1. RECORD COUNTS BY TABLE:\n');
  for (const [t, c] of Object.entries(counts)) {
    console.log(`  - ${t.padEnd(30)} : ${c}`);
  }

  console.log('\n2. DETAILED RECORDS FOUND:\n');

  if (sampleRecords['auth.users']?.length > 0) {
    console.log('--- auth.users ---');
    console.log(JSON.stringify(sampleRecords['auth.users'], null, 2));
  }

  if (sampleRecords['profiles']?.length > 0) {
    console.log('--- profiles ---');
    console.log(JSON.stringify(sampleRecords['profiles'], null, 2));
  }

  if (sampleRecords['appointments']?.length > 0) {
    console.log('--- appointments ---');
    console.log(JSON.stringify(sampleRecords['appointments'], null, 2));
  }

  if (sampleRecords['appointment_calendar_events']?.length > 0) {
    console.log('--- appointment_calendar_events ---');
    console.log(JSON.stringify(sampleRecords['appointment_calendar_events'], null, 2));
  }

  if (sampleRecords['user_calendar_tokens']?.length > 0) {
    console.log('--- user_calendar_tokens ---');
    console.log(JSON.stringify(sampleRecords['user_calendar_tokens'], null, 2));
  }

  if (sampleRecords['prescriptions']?.length > 0) {
    console.log('--- prescriptions ---');
    console.log(JSON.stringify(sampleRecords['prescriptions'], null, 2));
  }
}

runCompleteAudit();
