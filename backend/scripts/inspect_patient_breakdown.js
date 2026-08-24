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

async function inspectPatientDetails() {
  const patientIds = [
    '21536143-a325-49a4-80aa-50e601d7068e',
    'b05bfc8c-fb8b-4f9c-a79c-e4184017772c',
    '60bd8fd0-c1ac-434e-88ec-f2abd06544c7',
  ];

  console.log('\n================================================================');
  console.log('  Detailed Patient Accounts & Records Breakdown');
  console.log('================================================================\n');

  for (const pid of patientIds) {
    console.log(`\n================== PATIENT ID: ${pid} ==================`);

    // 1. Appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, doctor_id, start_time, end_time, status, created_at')
      .eq('patient_id', pid);
    console.log(`Appointments (${appts?.length || 0}):`);
    console.log(JSON.stringify(appts, null, 2));

    // 2. Prescriptions
    const { data: rx } = await supabase
      .from('prescriptions')
      .select('*, prescription_items(*)')
      .eq('patient_id', pid);
    console.log(`Prescriptions (${rx?.length || 0}):`);
    console.log(JSON.stringify(rx, null, 2));

    // 3. Consultation notes
    const { data: notes } = await supabase
      .from('consultation_notes')
      .select('*')
      .eq('patient_id', pid);
    console.log(`Consultation Notes (${notes?.length || 0}):`);
    console.log(JSON.stringify(notes, null, 2));

    // 4. Intakes
    const { data: intakes } = await supabase
      .from('patient_intake')
      .select('*')
      .eq('patient_id', pid);
    console.log(`Intakes (${intakes?.length || 0}):`);
    console.log(JSON.stringify(intakes, null, 2));

    // 5. Medication Reminders
    const { data: rems } = await supabase
      .from('medication_reminders')
      .select('*')
      .eq('patient_id', pid);
    console.log(`Medication Reminders (${rems?.length || 0}):`);
    console.log(JSON.stringify(rems, null, 2));

    // 6. Notifications
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', pid);
    console.log(`Notifications (${notifs?.length || 0}):`);
    console.log(JSON.stringify(notifs, null, 2));
  }
}

inspectPatientDetails();
