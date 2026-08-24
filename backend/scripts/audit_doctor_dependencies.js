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

async function auditDoctorDependencies() {
  const doctorId = 'd8e19e35-57d3-4722-907f-0b9019283b8d';

  console.log('\n================================================================');
  console.log(`  MedSync Complete Audit: Test Doctor (${doctorId})`);
  console.log('================================================================\n');

  // 1. Check doctor_profiles
  const { data: docProf } = await supabase
    .from('doctor_profiles')
    .select('*, profiles(*)')
    .eq('id', doctorId);
  console.log(`1. doctor_profiles: ${docProf?.length || 0}`);
  if (docProf && docProf.length > 0) console.log(JSON.stringify(docProf, null, 2));

  // 2. Check appointments
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, start_time, end_time, status, created_at')
    .eq('doctor_id', doctorId);
  console.log(`\n2. appointments: ${appts?.length || 0}`);
  if (appts && appts.length > 0) console.log(JSON.stringify(appts, null, 2));

  const apptIds = (appts || []).map((a) => a.id);

  // 3. Check appointment_slots
  const { count: slotCount } = await supabase
    .from('appointment_slots')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId);
  console.log(`\n3. appointment_slots: ${slotCount || 0}`);

  // 4. Check doctor_working_hours
  const { data: wh } = await supabase
    .from('doctor_working_hours')
    .select('*')
    .eq('doctor_id', doctorId);
  console.log(`\n4. doctor_working_hours: ${wh?.length || 0}`);

  // 5. Check doctor_leaves
  const { data: leaves } = await supabase
    .from('doctor_leaves')
    .select('*')
    .eq('doctor_id', doctorId);
  console.log(`\n5. doctor_leaves: ${leaves?.length || 0}`);

  // 6. Check consultation_notes
  const { data: notes } = await supabase
    .from('consultation_notes')
    .select('*')
    .eq('doctor_id', doctorId);
  console.log(`\n6. consultation_notes: ${notes?.length || 0}`);
  if (notes && notes.length > 0) console.log(JSON.stringify(notes, null, 2));

  // 7. Check prescriptions
  const { data: rx } = await supabase
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .eq('doctor_id', doctorId);
  console.log(`\n7. prescriptions: ${rx?.length || 0}`);
  if (rx && rx.length > 0) console.log(JSON.stringify(rx, null, 2));

  // 8. Check patient_intake for doctor's appointments
  let intakeCount = 0;
  if (apptIds.length > 0) {
    const { count } = await supabase
      .from('patient_intake')
      .select('*', { count: 'exact', head: true })
      .in('appointment_id', apptIds);
    intakeCount = count || 0;
  }
  console.log(`\n8. patient_intake (for doctor's appointments): ${intakeCount}`);

  // 9. Check ai_pre_visit_summaries & ai_post_visit_summaries
  const { count: preAiCount } = await supabase
    .from('ai_pre_visit_summaries')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId);
  console.log(`\n9. ai_pre_visit_summaries: ${preAiCount || 0}`);

  const { count: postAiCount } = await supabase
    .from('ai_post_visit_summaries')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId);
  console.log(`10. ai_post_visit_summaries: ${postAiCount || 0}`);

  // 10. Check email_jobs
  const { count: emailCount } = await supabase
    .from('email_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', doctorId);
  console.log(`\n11. email_jobs (recipient = doctor): ${emailCount || 0}`);

  // 11. Check notifications
  const { count: notifCount } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', doctorId);
  console.log(`\n12. notifications: ${notifCount || 0}`);

  // 12. Check calendar events & tokens
  const { count: calEventCount } = await supabase
    .from('appointment_calendar_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', doctorId);
  console.log(`\n13. appointment_calendar_events (user = doctor): ${calEventCount || 0}`);

  const { count: calTokCount } = await supabase
    .from('user_calendar_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', doctorId);
  console.log(`14. user_calendar_tokens: ${calTokCount || 0}`);

  console.log('\n================================================================\n');
}

auditDoctorDependencies();
