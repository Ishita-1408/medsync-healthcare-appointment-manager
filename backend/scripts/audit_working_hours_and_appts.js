import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function inspectDoctorWorkingHoursAndAppointments() {
  console.log('=== AUDITING DOCTOR_WORKING_HOURS & APPOINTMENTS ===\n');

  const { data: wh, error: whErr } = await supabase
    .from('doctor_working_hours')
    .select('*');

  console.log(`Total rows in doctor_working_hours: ${wh?.length || 0}`);
  if (wh) {
    wh.forEach(w => {
      console.log(`  Doctor: ${w.doctor_id} | Day: ${w.day_of_week} | Time: ${w.start_time} - ${w.end_time} | Active: ${w.is_active} | ID: ${w.id}`);
    });
  }

  const { data: appts, error: apptErr } = await supabase
    .from('appointments')
    .select('*')
    .order('created_at', { ascending: true });

  console.log(`\nTotal rows in appointments: ${appts?.length || 0}`);
  if (appts) {
    appts.forEach((a, i) => {
      console.log(`  [${i + 1}] ID: ${a.id} | Patient: ${a.patient_id} | Doctor: ${a.doctor_id} | Status: ${a.status} | Created: ${a.created_at} | Reason: ${a.cancellation_reason}`);
    });
  }
}

inspectDoctorWorkingHoursAndAppointments();
