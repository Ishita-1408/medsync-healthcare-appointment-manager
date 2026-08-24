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

async function checkLiveDatabase() {
  console.log('=== REAL-WORLD SUPABASE DATABASE VERIFICATION ===\n');

  // 1. Check email_jobs table accessibility
  try {
    const { data: jobs, error: jobsErr } = await supabase
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (jobsErr) {
      console.log('✗ [email_jobs Table]: Error querying email_jobs:', jobsErr.message);
    } else {
      console.log(`✓ [email_jobs Table]: Accessible! Found ${jobs?.length || 0} existing jobs.`);
      if (jobs && jobs.length > 0) {
        console.log('Sample email jobs in live database:');
        jobs.slice(0, 3).forEach((j) => {
          console.log(`  - ID: ${j.id} | Type: ${j.email_type} | Status: ${j.status} | Recipient: ${j.recipient_email} | NextRetry: ${j.next_retry_at}`);
        });
      }
    }
  } catch (err) {
    console.log('✗ [email_jobs Table Query Exception]:', err.message);
  }

  // 2. Test claim_next_email_job RPC
  try {
    const { data: claimRes, error: claimErr } = await supabase.rpc('claim_next_email_job', {
      p_worker_id: 'test_verifier_worker',
    });

    if (claimErr) {
      console.log('✗ [claim_next_email_job RPC]: Error executing RPC:', claimErr.message);
    } else {
      console.log(`✓ [claim_next_email_job RPC]: Active and executable! Claimed ${claimRes?.length || 0} pending jobs.`);
    }
  } catch (err) {
    console.log('✗ [claim_next_email_job RPC Exception]:', err.message);
  }

  // 3. Check appointments table & doctor/patient profiles
  try {
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .limit(5);

    console.log(`✓ [profiles Table]: ${profiles?.length || 0} profiles available.`);

    const { data: appts, error: apptErr } = await supabase
      .from('appointments')
      .select('id, patient_id, doctor_id, start_time, end_time, status')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log(`✓ [appointments Table]: ${appts?.length || 0} appointments available.`);
    if (appts && appts.length > 0) {
      console.log('Latest appointment:', appts[0]);
    }
  } catch (err) {
    console.log('✗ [Appointments/Profiles Check]:', err.message);
  }
}

checkLiveDatabase();
