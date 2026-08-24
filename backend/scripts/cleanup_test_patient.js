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

async function cleanupTestPatient() {
  const testPatientId = '21536143-a325-49a4-80aa-50e601d7068e';

  console.log('\n================================================================');
  console.log('  MedSync Test Data Removal Execution');
  console.log('================================================================\n');

  console.log('IDENTIFIED TEST PATIENT:');
  console.log(`User ID: ${testPatientId}`);
  console.log(`Purpose: Slot duplication & cancellation automated testing (Aug 23)`);

  // 1. Delete associated email jobs if any
  const { data: delEmail, error: eErr } = await supabase
    .from('email_jobs')
    .delete()
    .eq('recipient_id', testPatientId)
    .select();
  console.log(`Deleted Email Jobs: ${delEmail?.length || 0}`, eErr ? `(${eErr.message})` : '');

  // 2. Delete associated notifications if any
  const { data: delNotif, error: nErr } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', testPatientId)
    .select();
  console.log(`Deleted Notifications: ${delNotif?.length || 0}`, nErr ? `(${nErr.message})` : '');

  // 3. Delete associated medication reminders if any
  const { data: delRem, error: rErr } = await supabase
    .from('medication_reminders')
    .delete()
    .eq('patient_id', testPatientId)
    .select();
  console.log(`Deleted Medication Reminders: ${delRem?.length || 0}`, rErr ? `(${rErr.message})` : '');

  // 4. Delete calendar events if any
  const { data: delCal, error: cErr } = await supabase
    .from('appointment_calendar_events')
    .delete()
    .eq('user_id', testPatientId)
    .select();
  console.log(`Deleted Calendar Events: ${delCal?.length || 0}`, cErr ? `(${cErr.message})` : '');

  // 5. Delete calendar tokens if any
  const { data: delTok, error: tErr } = await supabase
    .from('user_calendar_tokens')
    .delete()
    .eq('user_id', testPatientId)
    .select();
  console.log(`Deleted Calendar Tokens: ${delTok?.length || 0}`, tErr ? `(${tErr.message})` : '');

  // 6. Delete appointments
  const { data: delAppts, error: aErr } = await supabase
    .from('appointments')
    .delete()
    .eq('patient_id', testPatientId)
    .select();
  console.log(`Deleted Test Appointments: ${delAppts?.length || 0}`, aErr ? `(${aErr.message})` : '');

  // 7. Delete patient profile
  const { data: delProf, error: pErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', testPatientId)
    .select();
  console.log(`Deleted Test Profile: ${delProf?.length || 0}`, pErr ? `(${pErr.message})` : '');

  console.log('\n================================================================');
  console.log('  Test Data Cleanup Completed Successfully');
  console.log('================================================================\n');
}

cleanupTestPatient();
