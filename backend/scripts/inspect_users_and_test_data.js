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

async function inspectAllProfilesAndData() {
  console.log('\n================================================================');
  console.log('  MedSync Database Inspection: Users & Associated Records');
  console.log('================================================================\n');

  // 1. Fetch all profiles
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  console.log(`Total profiles found: ${profiles?.length || 0}`, pErr ? `(Error: ${pErr.message})` : '');
  if (profiles) {
    for (const p of profiles) {
      console.log(`\n------------------------------------------------------------`);
      console.log(`Profile ID: ${p.id}`);
      console.log(`Name: ${p.first_name || ''} ${p.last_name || ''}`);
      console.log(`Email / Role: ${p.email || 'N/A'} | Role: ${p.role}`);
      console.log(`Created: ${p.created_at}`);

      // Count appointments as patient
      const { count: apptCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', p.id);

      // Count appointments as doctor
      const { count: docApptCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', p.id);

      // Count prescriptions
      const { count: rxCount } = await supabase
        .from('prescriptions')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', p.id);

      // Count medication reminders
      const { count: remCount } = await supabase
        .from('medication_reminders')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', p.id);

      // Count email jobs
      const { count: emailCount } = await supabase
        .from('email_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', p.id);

      // Count notifications
      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', p.id);

      // Count calendar events
      const { count: calCount } = await supabase
        .from('appointment_calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', p.id);

      // Count calendar tokens
      const { count: tokCount } = await supabase
        .from('user_calendar_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', p.id);

      console.log(`Associated Records:`);
      console.log(`- Appointments (as patient): ${apptCount || 0}`);
      console.log(`- Appointments (as doctor): ${docApptCount || 0}`);
      console.log(`- Prescriptions: ${rxCount || 0}`);
      console.log(`- Medication Reminders: ${remCount || 0}`);
      console.log(`- Email Jobs: ${emailCount || 0}`);
      console.log(`- Notifications: ${notifCount || 0}`);
      console.log(`- Calendar Events: ${calCount || 0}`);
      console.log(`- Calendar Tokens: ${tokCount || 0}`);
    }
  }

  // 2. Query doctor_profiles
  const { data: docProfiles } = await supabase
    .from('doctor_profiles')
    .select('*, profiles(*)');

  console.log(`\nDoctor profiles found: ${docProfiles?.length || 0}`);
  if (docProfiles && docProfiles.length > 0) {
    console.log(JSON.stringify(docProfiles, null, 2));
  }

  // 3. Query all appointments
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, start_time, end_time, status, created_at');

  console.log(`\nAppointments found: ${appts?.length || 0}`);
  if (appts && appts.length > 0) {
    console.log(JSON.stringify(appts, null, 2));
  }

  // 4. Query all email_jobs
  const { data: allEmailJobs } = await supabase
    .from('email_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`\nAll Email Jobs found: ${allEmailJobs?.length || 0}`);
  if (allEmailJobs && allEmailJobs.length > 0) {
    console.log(JSON.stringify(allEmailJobs, null, 2));
  }

  // 5. Query all medication_reminders
  const { data: allReminders } = await supabase
    .from('medication_reminders')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`\nAll Medication Reminders found: ${allReminders?.length || 0}`);
  if (allReminders && allReminders.length > 0) {
    console.log(JSON.stringify(allReminders, null, 2));
  }

  console.log('\n================================================================\n');
}

inspectAllProfilesAndData();
