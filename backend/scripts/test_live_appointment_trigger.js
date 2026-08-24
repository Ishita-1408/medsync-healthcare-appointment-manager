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

async function runLiveTriggerTest() {
  console.log('=== TESTING LIVE TRIGGER & EMAIL_JOBS GENERATION ===\n');

  try {
    // 1. Check existing users in auth.users or profiles
    const { data: users, error: userErr } = await supabase.auth.admin.listUsers();
    console.log(`Found ${users?.users?.length || 0} registered auth users in Supabase.`);

    let testPatientId = null;
    let testDoctorId = null;
    let testPatientEmail = null;

    if (users && users.users.length >= 2) {
      testPatientId = users.users[0].id;
      testPatientEmail = users.users[0].email;
      testDoctorId = users.users[1].id;
      console.log(`Using existing users: Patient=${testPatientEmail} (${testPatientId}), Doctor=${testDoctorId}`);
    } else if (users && users.users.length === 1) {
      testPatientId = users.users[0].id;
      testPatientEmail = users.users[0].email;
      testDoctorId = users.users[0].id;
      console.log(`Using single user for test: ${testPatientEmail} (${testPatientId})`);
    } else {
      console.log('No auth users currently in Supabase. Checking profiles table...');
      const { data: profiles } = await supabase.from('profiles').select('*');
      console.log(`Profiles count: ${profiles?.length || 0}`);
    }

    // 2. Query email_jobs directly
    const { data: existingJobs, error: qErr } = await supabase
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (qErr) {
      console.error('Error reading email_jobs:', qErr.message);
    } else {
      console.log(`Current email_jobs count: ${existingJobs?.length || 0}`);
    }

    // 3. Test atomic claim RPC
    const { data: claimed, error: cErr } = await supabase.rpc('claim_next_email_job', {
      p_worker_id: 'verifier_worker',
    });

    if (cErr) {
      console.error('RPC claim_next_email_job error:', cErr.message);
    } else {
      console.log(`claim_next_email_job RPC status: OK (claimed: ${claimed?.length || 0})`);
    }

  } catch (err) {
    console.error('Live trigger test exception:', err);
  }
}

runLiveTriggerTest();
