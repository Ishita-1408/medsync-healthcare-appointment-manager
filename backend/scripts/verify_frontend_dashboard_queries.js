import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEMO_PASSWORD = 'MedSyncDemo2026!';

async function verifyFrontendDashboardQueries() {
  console.log('\n=== VERIFYING FRONTEND DASHBOARD QUERIES ===\n');

  // 1. Patient Dashboard Query (Jane Cooper)
  const patClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: patAuth } = await patClient.auth.signInWithPassword({
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
    .eq('patient_id', patAuth.user.id)
    .order('start_time', { ascending: true });

  console.log('PATIENT DASHBOARD (Jane Cooper) with .eq(patient_id, user.id):');
  console.log(`Visible Appointments Count: ${patAppts.length}`);
  patAppts.forEach((a, i) => {
    const docName = `Dr. ${a.doctor?.profile?.first_name || ''} ${a.doctor?.profile?.last_name || ''}`;
    console.log(`  [${i + 1}] Status: ${a.status} | Doctor: ${docName} | Start: ${a.start_time}`);
  });

  // 2. Doctor Dashboard Query (Dr. Ananya Sharma)
  const doc1Client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: doc1Auth } = await doc1Client.auth.signInWithPassword({
    email: 'dr.ananya@medsync.health',
    password: DEMO_PASSWORD,
  });

  const { data: doc1Appts } = await doc1Client
    .from('appointments')
    .select(`
      id,
      start_time,
      end_time,
      status,
      patient:patient_profiles(
        id,
        profile:profiles(first_name, last_name)
      )
    `)
    .eq('doctor_id', doc1Auth.user.id)
    .order('start_time', { ascending: true });

  console.log('\nDOCTOR DASHBOARD (Dr. Ananya Sharma - General Medicine):');
  console.log(`Visible Appointments Count: ${doc1Appts.length}`);
  doc1Appts.forEach((a, i) => {
    const patName = `${a.patient?.profile?.first_name || ''} ${a.patient?.profile?.last_name || ''}`;
    console.log(`  [${i + 1}] Status: ${a.status} | Patient: ${patName} | Start: ${a.start_time}`);
  });

  // 3. Doctor Dashboard Query (Dr. Rahul Mehta)
  const doc2Client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: doc2Auth } = await doc2Client.auth.signInWithPassword({
    email: 'dr.rahul@medsync.health',
    password: DEMO_PASSWORD,
  });

  const { data: doc2Appts } = await doc2Client
    .from('appointments')
    .select(`
      id,
      start_time,
      end_time,
      status,
      patient:patient_profiles(
        id,
        profile:profiles(first_name, last_name)
      )
    `)
    .eq('doctor_id', doc2Auth.user.id)
    .order('start_time', { ascending: true });

  console.log('\nDOCTOR DASHBOARD (Dr. Rahul Mehta - Cardiology):');
  console.log(`Visible Appointments Count: ${doc2Appts.length}`);
  doc2Appts.forEach((a, i) => {
    const patName = `${a.patient?.profile?.first_name || ''} ${a.patient?.profile?.last_name || ''}`;
    console.log(`  [${i + 1}] Status: ${a.status} | Patient: ${patName} | Start: ${a.start_time}`);
  });
}

verifyFrontendDashboardQueries();
