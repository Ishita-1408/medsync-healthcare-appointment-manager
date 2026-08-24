import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

async function compareAppointments() {
  console.log('\n================================================================');
  console.log('  Side-by-Side Comparison: Sarah Connor vs Shikha Prem');
  console.log('================================================================\n');

  // 1. Fetch all appointments ordered by created_at desc
  const { data: appts, error: aErr } = await supabase
    .from('appointments')
    .select(`
      *,
      doctor_profiles (
        *,
        profiles (*)
      ),
      patient_profiles (
        *,
        profiles (*)
      )
    `)
    .order('created_at', { ascending: false });

  console.log(`Total appointments in DB: ${appts?.length || 0}`, aErr ? `(Error: ${aErr.message})` : '');
  
  if (appts && appts.length > 0) {
    for (const a of appts) {
      const docName = a.doctor_profiles?.profiles ? `${a.doctor_profiles.profiles.first_name} ${a.doctor_profiles.profiles.last_name}` : 'Unknown Doctor';
      const patName = a.patient_profiles?.profiles ? `${a.patient_profiles.profiles.first_name} ${a.patient_profiles.profiles.last_name}` : 'Unknown Patient';
      
      console.log(`\n------------------------------------------------------------`);
      console.log(`Appt ID: ${a.id}`);
      console.log(`Doctor ID: ${a.doctor_id} (${docName})`);
      console.log(`Patient ID: ${a.patient_id} (${patName})`);
      console.log(`Status: ${a.status} | Start: ${a.start_time} | Created At: ${a.created_at}`);

      // Query email jobs for this appointment
      const { data: jobs, error: jErr } = await supabase
        .from('email_jobs')
        .select('*')
        .eq('appointment_id', a.id);

      console.log(`Email Jobs (${jobs?.length || 0}):`);
      if (jobs && jobs.length > 0) {
        for (const j of jobs) {
          console.log(`  - Job ID: ${j.id}`);
          console.log(`    Recipient: ${j.recipient_email} (${j.recipient_name})`);
          console.log(`    Type: ${j.email_type} | Status: ${j.status}`);
          console.log(`    Provider ID: ${j.provider_message_id || 'NONE'}`);
          console.log(`    Last Error: ${j.last_error || 'NONE'}`);
          console.log(`    Payload:`, JSON.stringify(j.payload));
        }
      } else if (jErr) {
        console.log(`  Error querying email jobs: ${jErr.message}`);
      }
    }
  }

  // 2. Also search for "Shikha" or "Prem" across profiles & doctor_profiles
  console.log('\n================== SEARCHING PROFILES FOR SHIKHA PREM ==================');
  const { data: shikhaProfiles, error: sErr } = await supabase
    .from('profiles')
    .select('*')
    .or('first_name.ilike.%shikha%,last_name.ilike.%prem%,first_name.ilike.%prem%,last_name.ilike.%shikha%');

  console.log(`Profiles matching "Shikha / Prem": ${shikhaProfiles?.length || 0}`);
  if (shikhaProfiles && shikhaProfiles.length > 0) {
    console.log(JSON.stringify(shikhaProfiles, null, 2));
  }

  const { data: shikhaDocProfiles } = await supabase
    .from('doctor_profiles')
    .select('*, profiles(*)');

  console.log(`\nAll Doctor Profiles: ${shikhaDocProfiles?.length || 0}`);
  if (shikhaDocProfiles) {
    console.log(JSON.stringify(shikhaDocProfiles, null, 2));
  }

  console.log('\n================================================================\n');
}

compareAppointments();
