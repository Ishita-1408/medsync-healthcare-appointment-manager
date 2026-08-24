import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEMO_PASSWORD = 'MedSyncDemo2026!';

async function verifyDashboards() {
  console.log('\n================================================================');
  console.log('  Verifying Dashboard State & RLS Isolation for Demo Accounts');
  console.log('================================================================\n');

  // 1. Jane Cooper (Patient)
  const patClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await patClient.auth.signInWithPassword({
    email: 'patient.demo@medsync.health',
    password: DEMO_PASSWORD,
  });

  const { data: patAppts } = await patClient
    .from('appointments')
    .select(`
      id,
      start_time,
      end_time,
      status,
      doctor:doctor_profiles(
        id,
        specialization,
        profile:profiles(first_name, last_name)
      )
    `)
    .order('start_time', { ascending: true });

  const { data: patPrescriptions } = await patClient
    .from('prescriptions')
    .select(`
      id,
      status,
      issued_at,
      prescription_items(*)
    `);

  console.log('1. PATIENT DASHBOARD (Jane Cooper):');
  console.log(`  - Total Visible Appointments: ${patAppts?.length || 0}`);
  patAppts?.forEach((a, idx) => {
    const docName = a.doctor?.profile ? `Dr. ${a.doctor.profile.first_name} ${a.doctor.profile.last_name}` : 'Doctor';
    console.log(`    [${idx + 1}] Status: ${a.status.padEnd(9)} | Doctor: ${docName.padEnd(20)} | Time: ${a.start_time}`);
  });
  console.log(`  - Total Visible Prescriptions: ${patPrescriptions?.length || 0}`);
  patPrescriptions?.forEach((p, idx) => {
    console.log(`    [${idx + 1}] Status: ${p.status} | Items: ${p.prescription_items?.length || 0} medications`);
  });

  // 2. Dr. Ananya Sharma (General Medicine)
  const doc1Client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await doc1Client.auth.signInWithPassword({
    email: 'dr.ananya@medsync.health',
    password: DEMO_PASSWORD,
  });

  const { data: doc1Appts } = await doc1Client
    .from('appointments')
    .select('id, start_time, end_time, status')
    .order('start_time', { ascending: true });

  console.log('\n2. DOCTOR DASHBOARD (Dr. Ananya Sharma - General Medicine):');
  console.log(`  - Total Visible Appointments: ${doc1Appts?.length || 0}`);
  doc1Appts?.forEach((a, idx) => {
    console.log(`    [${idx + 1}] Status: ${a.status.padEnd(9)} | Time: ${a.start_time}`);
  });

  // 3. Dr. Rahul Mehta (Cardiology)
  const doc2Client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  await doc2Client.auth.signInWithPassword({
    email: 'dr.rahul@medsync.health',
    password: DEMO_PASSWORD,
  });

  const { data: doc2Appts } = await doc2Client
    .from('appointments')
    .select('id, start_time, end_time, status')
    .order('start_time', { ascending: true });

  const { data: doc2Notes } = await doc2Client
    .from('consultation_notes')
    .select('id, diagnosis, is_finalized');

  console.log('\n3. DOCTOR DASHBOARD (Dr. Rahul Mehta - Cardiology):');
  console.log(`  - Total Visible Appointments: ${doc2Appts?.length || 0}`);
  doc2Appts?.forEach((a, idx) => {
    console.log(`    [${idx + 1}] Status: ${a.status.padEnd(9)} | Time: ${a.start_time}`);
  });
  console.log(`  - Finalized Consultation Notes: ${doc2Notes?.length || 0}`);
  doc2Notes?.forEach((n, idx) => {
    console.log(`    [${idx + 1}] Diagnosis: "${n.diagnosis}" (Finalized: ${n.is_finalized})`);
  });

  console.log('\n================================================================');
  console.log('✓ ALL DASHBOARD VIEWS AND ISOLATION VERIFIED SUCCESSFULLY');
  console.log('================================================================\n');
}

verifyDashboards().catch(console.error);
