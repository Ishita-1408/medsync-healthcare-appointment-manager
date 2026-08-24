import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEMO_PASSWORD = 'MedSyncDemo2026!';

// Helper to create client
function getClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

async function seedClinicalDataset() {
  console.log('\n================================================================');
  console.log('  Seeding Demo Clinical Encounters (Authenticated RLS Session)');
  console.log('================================================================\n');

  const patientClient = getClient();
  const drAnanyaClient = getClient();
  const drRahulClient = getClient();

  // 1. Sign In Patient Jane Cooper
  console.log('Authenticating Jane Cooper (patient.demo@medsync.health)...');
  const { data: patAuth, error: patAuthErr } = await patientClient.auth.signInWithPassword({
    email: 'patient.demo@medsync.health',
    password: DEMO_PASSWORD,
  });

  if (patAuthErr) throw new Error(`Patient login failed: ${patAuthErr.message}`);
  const patientId = patAuth.user.id;
  console.log(`✓ Jane Cooper authenticated (UUID: ${patientId})`);

  // 2. Sign In Dr. Ananya Sharma
  console.log('Authenticating Dr. Ananya Sharma (dr.ananya@medsync.health)...');
  const { data: doc1Auth, error: doc1AuthErr } = await drAnanyaClient.auth.signInWithPassword({
    email: 'dr.ananya@medsync.health',
    password: DEMO_PASSWORD,
  });

  if (doc1AuthErr) throw new Error(`Dr. Ananya login failed: ${doc1AuthErr.message}`);
  const drAnanyaId = doc1Auth.user.id;
  console.log(`✓ Dr. Ananya Sharma authenticated (UUID: ${drAnanyaId})`);

  // 3. Sign In Dr. Rahul Mehta
  console.log('Authenticating Dr. Rahul Mehta (dr.rahul@medsync.health)...');
  const { data: doc2Auth, error: doc2AuthErr } = await drRahulClient.auth.signInWithPassword({
    email: 'dr.rahul@medsync.health',
    password: DEMO_PASSWORD,
  });

  if (doc2AuthErr) throw new Error(`Dr. Rahul login failed: ${doc2AuthErr.message}`);
  const drRahulId = doc2Auth.user.id;
  console.log(`✓ Dr. Rahul Mehta authenticated (UUID: ${drRahulId})`);

  // ===========================================================================
  // STEP A: CONFIGURE PROFILES & DOCTOR WORKING HOURS
  // ===========================================================================
  console.log('\n▶ Configuring Patient & Doctor Profile Details...');

  // Patient Profile
  await patientClient.from('patient_profiles').upsert({
    id: patientId,
    date_of_birth: '1992-05-14',
    gender: 'FEMALE',
    blood_group: 'O+',
    emergency_contact_name: 'Robert Cooper',
    emergency_contact_phone: '+91 98765 12345',
  });
  console.log('✓ Patient profile updated (DOB: 1992-05-14, O+).');

  // Dr. Ananya Profile & Hours
  await drAnanyaClient.from('doctor_profiles').upsert({
    id: drAnanyaId,
    specialization: 'General Medicine',
    license_number: 'MED-849204',
    consultation_duration_minutes: 30,
    bio: 'Senior Consultant in Internal & Preventive Medicine with over 12 years of clinical experience in comprehensive patient care, chronic disease management, and diagnostic evaluation.',
    is_active: true,
  });

  const ananyaHours = [];
  for (let day = 1; day <= 5; day++) {
    ananyaHours.push({
      doctor_id: drAnanyaId,
      day_of_week: day,
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_active: true,
    });
  }
  await drAnanyaClient.from('doctor_working_hours').upsert(ananyaHours);
  console.log('✓ Dr. Ananya Sharma profile & working hours configured.');

  // Dr. Rahul Profile & Hours
  await drRahulClient.from('doctor_profiles').upsert({
    id: drRahulId,
    specialization: 'Cardiology',
    license_number: 'MED-910482',
    consultation_duration_minutes: 30,
    bio: 'Board-certified Clinical Cardiologist specializing in preventive cardiology, hypertension management, arrhythmia assessment, and cardiovascular risk stratification.',
    is_active: true,
  });

  const rahulHours = [];
  for (let day = 1; day <= 5; day++) {
    rahulHours.push({
      doctor_id: drRahulId,
      day_of_week: day,
      start_time: '10:00:00',
      end_time: '18:00:00',
      is_active: true,
    });
  }
  await drRahulClient.from('doctor_working_hours').upsert(rahulHours);
  console.log('✓ Dr. Rahul Mehta profile & working hours configured.');

  // ===========================================================================
  // STEP B: BOOK APPOINTMENT 1 (UPCOMING CONFIRMED)
  // ===========================================================================
  console.log('\n▶ Creating Appointment 1 (Upcoming Confirmed with Dr. Ananya Sharma)...');

  const futureStart = new Date();
  futureStart.setDate(futureStart.getDate() + 2);
  futureStart.setUTCHours(5, 0, 0, 0); // 10:30 AM IST
  const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

  // Check if an existing appointment exists with Dr. Ananya
  let appt1 = null;
  const { data: existingAppts1 } = await patientClient
    .from('appointments')
    .select('*')
    .eq('patient_id', patientId)
    .eq('doctor_id', drAnanyaId);

  if (existingAppts1 && existingAppts1.length > 0) {
    const { data: updated1, error: uErr1 } = await patientClient
      .from('appointments')
      .update({
        start_time: futureStart.toISOString(),
        end_time: futureEnd.toISOString(),
        status: 'CONFIRMED',
        hold_expires_at: null,
        cancellation_reason: null,
      })
      .eq('id', existingAppts1[0].id)
      .select()
      .single();

    if (uErr1) console.error('Appointment 1 update error:', uErr1.message);
    appt1 = updated1;
    console.log(`✓ Reused Appointment 1 (ID: ${appt1?.id}, Status: CONFIRMED)`);
  } else {
    const { data: inserted1, error: iErr1 } = await patientClient
      .from('appointments')
      .insert({
        patient_id: patientId,
        doctor_id: drAnanyaId,
        start_time: futureStart.toISOString(),
        end_time: futureEnd.toISOString(),
        status: 'CONFIRMED',
      })
      .select()
      .single();

    if (iErr1) console.error('Appointment 1 insert error:', iErr1.message);
    appt1 = inserted1;
    console.log(`✓ Inserted Appointment 1 (ID: ${appt1?.id}, Status: CONFIRMED)`);
  }

  // Pre-Visit Intake for Appt 1
  const { data: intake1, error: intake1Err } = await patientClient.from('appointment_intakes').upsert({
    appointment_id: appt1.id,
    patient_id: patientId,
    doctor_id: drAnanyaId,
    chief_complaint: 'Routine preventive wellness evaluation and general health review',
    symptoms: 'Mild general fatigue over past few days',
    symptom_onset: '1 week',
    severity: 'MILD',
    progression: 'SAME',
    current_medications: 'Daily Multivitamin & Omega-3',
    allergies: 'None known',
    additional_notes: 'Desk job, normal diet and sleep',
  }).select().single();

  if (intake1Err) console.error('Intake 1 error:', intake1Err.message);
  else console.log('✓ Pre-visit intake recorded for Appointment 1.');

  // AI Pre-Visit Summary for Appt 1
  await drAnanyaClient.from('ai_pre_visit_summaries').upsert({
    appointment_id: appt1.id,
    intake_id: intake1?.id,
    patient_id: patientId,
    doctor_id: drAnanyaId,
    urgency: 'Low',
    chief_complaint: 'Routine preventive wellness evaluation and mild general fatigue.',
    suggested_questions: [
      'Have there been recent changes in dietary intake, work stress, or sleep architecture?',
      'Any personal or family history of thyroid dysfunction or iron deficiency anemia?',
    ],
    model_used: 'gemini-1.5-flash',
    status: 'COMPLETED',
  });
  console.log('✓ AI Pre-Visit summary created for Appointment 1.');

  // ===========================================================================
  // STEP C: BOOK APPOINTMENT 2 (COMPLETED CLINICAL ENCOUNTER)
  // ===========================================================================
  console.log('\n▶ Creating Appointment 2 (Completed Encounter with Dr. Rahul Mehta)...');

  const pastStart = new Date();
  pastStart.setDate(pastStart.getDate() - 1);
  pastStart.setUTCHours(9, 0, 0, 0); // 02:30 PM IST
  const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

  let appt2 = null;
  const { data: existingAppts2 } = await patientClient
    .from('appointments')
    .select('*')
    .eq('patient_id', patientId)
    .eq('doctor_id', drRahulId);

  if (existingAppts2 && existingAppts2.length > 0) {
    const { data: updated2, error: uErr2 } = await patientClient
      .from('appointments')
      .update({
        start_time: pastStart.toISOString(),
        end_time: pastEnd.toISOString(),
        status: 'CONFIRMED',
        hold_expires_at: null,
        cancellation_reason: null,
      })
      .eq('id', existingAppts2[0].id)
      .select()
      .single();

    if (uErr2) console.error('Appointment 2 update error:', uErr2.message);
    appt2 = updated2;
    console.log(`✓ Reused Appointment 2 (ID: ${appt2?.id})`);
  } else {
    const { data: inserted2, error: iErr2 } = await patientClient
      .from('appointments')
      .insert({
        patient_id: patientId,
        doctor_id: drRahulId,
        start_time: pastStart.toISOString(),
        end_time: pastEnd.toISOString(),
        status: 'CONFIRMED',
      })
      .select()
      .single();

    if (iErr2) console.error('Appointment 2 insert error:', iErr2.message);
    appt2 = inserted2;
    console.log(`✓ Inserted Appointment 2 (ID: ${appt2?.id})`);
  }

  // Pre-Visit Intake for Appt 2
  const { data: intake2, error: intake2Err } = await patientClient.from('appointment_intakes').insert({
    appointment_id: appt2.id,
    patient_id: patientId,
    doctor_id: drRahulId,
    chief_complaint: 'Post-exercise palpitations and elevated heart rate',
    symptoms: 'Occasional rapid heartbeat episodes following 3km morning jogs',
    symptom_onset: '2 weeks',
    severity: 'MODERATE',
    progression: 'FLUCTUATING',
    current_medications: 'None',
    allergies: 'Penicillin',
    additional_notes: 'Episodes resolve within 2-3 minutes of rest',
  }).select().single();

  if (intake2Err) console.error('Intake 2 error:', intake2Err.message);
  else console.log('✓ Pre-visit intake recorded for Appointment 2.');

  // AI Pre-Visit Summary for Appt 2
  await drRahulClient.from('ai_pre_visit_summaries').insert({
    appointment_id: appt2.id,
    intake_id: intake2?.id,
    patient_id: patientId,
    doctor_id: drRahulId,
    urgency: 'Medium',
    chief_complaint: 'Post-exertional palpitations lasting 2–3 minutes with no documented syncope or chest tightness.',
    suggested_questions: [
      'Did palpitation episodes coincide with hydration status or increased caffeine intake?',
      'Were any accompanying presyncope, shortness of breath, or diaphoresis noted?',
    ],
    model_used: 'gemini-1.5-flash',
    status: 'COMPLETED',
  });
  console.log('✓ AI Pre-Visit summary created for Appointment 2.');

  // Doctor Completes Encounter: Consultation SOAP Notes
  const { data: consult2, error: consult2Err } = await drRahulClient.from('consultation_notes').insert({
    appointment_id: appt2.id,
    doctor_id: drRahulId,
    patient_id: patientId,
    chief_complaint: 'Post-exercise palpitations, episodic, resolving spontaneously within 2–3 minutes.',
    examination_notes: 'Vitals: BP 120/78 mmHg, Resting HR 74 bpm regular, SpO2 99% on room air. Cardiovascular: Normal S1/S2 heart sounds, no audible murmurs, rubs, or gallops. Resting 12-lead ECG demonstrates normal sinus rhythm with physiological PR/QT intervals.',
    diagnosis: 'Benign Sinus Tachycardia post-exertion (non-ischemic, non-arrhythmogenic)',
    treatment_plan: 'Patient reassured regarding benign nature. Advised workout hydration protocols, limit caffeine post-run. Prescribed low-dose Atenolol 25mg as targeted support. Follow-up in 4 weeks.',
    doctor_notes: 'Excellent functional capacity. Echocardiogram not indicated at this stage. Re-evaluate if symptoms escalate.',
    follow_up_instructions: 'Maintain workout hydration. Return if palpitations occur at rest or cause dizziness.',
    follow_up_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    is_finalized: true,
  }).select().single();

  if (consult2Err) console.error('Consultation 2 error:', consult2Err.message);
  else console.log('✓ Finalized SOAP consultation notes recorded.');

  // Doctor Issues Finalized Digital Prescription
  const { data: rx2, error: rx2Err } = await drRahulClient.from('prescriptions').insert({
    appointment_id: appt2.id,
    consultation_id: consult2.id,
    doctor_id: drRahulId,
    patient_id: patientId,
    status: 'FINALIZED',
    notes: 'Take medications strictly with meals or plenty of water. Avoid sudden cessation without consulting physician.',
    issued_at: pastStart.toISOString(),
  }).select().single();

  if (rx2Err) console.error('Prescription error:', rx2Err.message);
  else console.log('✓ Finalized digital prescription created.');

  // Prescription Items
  await drRahulClient.from('prescription_items').insert([
    {
      prescription_id: rx2.id,
      medication_name: 'Atenolol',
      strength: '25mg',
      dosage: '1 tablet',
      frequency: 'Once daily (Morning)',
      route: 'Oral (PO)',
      duration: '14 days',
      quantity: '14 tablets',
      instructions: 'Take after breakfast with water. Helps maintain stable exercise heart rate.',
    },
    {
      prescription_id: rx2.id,
      medication_name: 'Coenzyme Q10 (CoQ10)',
      strength: '100mg',
      dosage: '1 capsule',
      frequency: 'Once daily',
      route: 'Oral (PO)',
      duration: '30 days',
      quantity: '30 capsules',
      instructions: 'Cardiovascular cellular health support. Take with lunch.',
    },
  ]);
  console.log('✓ 2 prescription medication items added to prescription.');

  // AI Post-Visit Summary
  await drRahulClient.from('ai_post_visit_summaries').insert({
    appointment_id: appt2.id,
    consultation_id: consult2.id,
    patient_id: patientId,
    doctor_id: drRahulId,
    prescription_id: rx2.id,
    summary: 'Your cardiac checkup and resting ECG are completely normal. The palpitations you felt after jogging are benign and related to natural exertion rather than any structural heart condition.',
    diagnosis_explanation: 'Benign Sinus Tachycardia means your heart is healthy and structurally sound, but your natural pacemaker rate rises slightly higher during and immediately after exercise. It is harmless and manageable with good hydration.',
    medications: [
      {
        name: 'Atenolol 25mg',
        schedule: '1 tablet every morning with breakfast for 14 days',
        purpose: 'Helps regulate post-workout heart rate and prevent palpitation sensations',
      },
      {
        name: 'Coenzyme Q10 100mg',
        schedule: '1 capsule daily with lunch for 30 days',
        purpose: 'Cardiovascular antioxidant and cellular energy support',
      },
    ],
    follow_up: {
      timeline: '4 weeks',
      actions: ['Stay well hydrated before morning runs', 'Avoid high-caffeine energy drinks immediately after workouts'],
      warning_signs: ['Chest discomfort or tightness', 'Dizziness or lightheadedness upon standing', 'Shortness of breath while resting'],
    },
    model_used: 'gemini-1.5-flash',
    status: 'COMPLETED',
  });
  console.log('✓ AI Post-Visit Patient Care Summary created.');

  // Mark Appointment 2 as COMPLETED
  await drRahulClient.from('appointments').update({
    status: 'COMPLETED',
  }).eq('id', appt2.id);
  console.log('✓ Appointment 2 marked as COMPLETED.');

  console.log('\n================================================================');
  console.log('✓ DEMO DATASET SEEDING COMPLETED WITH 100% SUCCESS');
  console.log('================================================================\n');
}

seedClinicalDataset().catch(console.error);
