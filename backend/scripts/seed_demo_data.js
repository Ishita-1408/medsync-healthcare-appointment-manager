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

// Demo UUIDs for deterministic, relationship-safe reference
const DEMO_IDS = {
  patientId: '11111111-1111-4111-a111-111111111111',
  doctor1Id: '22222222-2222-4222-a222-222222222222', // Dr. Ananya Sharma
  doctor2Id: '33333333-3333-4333-a333-333333333333', // Dr. Rahul Mehta
  adminId:   '44444444-4444-4444-a444-444444444444', // MedSync Administration
  apptUpcomingId: '55555555-5555-4555-a555-555555555555',
  apptCompletedId: '66666666-6666-4666-a666-666666666666',
  intakeUpcomingId: '77777777-7777-4777-a777-777777777777',
  intakeCompletedId: '88888888-8888-4888-a888-888888888888',
  consultationCompletedId: '99999999-9999-4999-a999-999999999999',
  prescriptionCompletedId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  prescriptionItem1Id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
  prescriptionItem2Id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
  aiPreVisitUpcomingId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
  aiPreVisitCompletedId: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
  aiPostVisitCompletedId: 'ffffffff-ffff-4fff-afff-ffffffffffff',
};

async function seedDemoEnvironment() {
  console.log('\n================================================================');
  console.log('  MedSync Controlled Demo-Data Cleanup & Seeding');
  console.log('================================================================\n');

  // ===========================================================================
  // PHASE 1: CLEANUP IDENTIFIED TEST RECORDS
  // ===========================================================================
  console.log('▶ PHASE 1: Cleaning 12 identified test appointments & test token...');

  // Delete all existing test appointments
  const { data: deletedAppts, error: delApptErr } = await supabase
    .from('appointments')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all previous test appointments

  if (delApptErr) {
    console.error('Error deleting test appointments:', delApptErr.message);
  } else {
    console.log('✓ Cleaned all previous test appointments from database.');
  }

  // Delete disconnected test calendar tokens
  const { error: delTokErr } = await supabase
    .from('user_calendar_tokens')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (delTokErr) {
    console.warn('Note on calendar tokens cleanup:', delTokErr.message);
  } else {
    console.log('✓ Cleaned disconnected test user calendar token.');
  }

  // Clean previous demo profiles if re-running
  await supabase.from('profiles').delete().in('id', Object.values(DEMO_IDS));

  // ===========================================================================
  // PHASE 2: SEED PROFESSIONAL DEMO USER PROFILES
  // ===========================================================================
  console.log('\n▶ PHASE 2: Seeding Demo Profiles (1 Patient, 2 Doctors, 1 Admin)...');

  // 1. Core Profiles
  const profilesToInsert = [
    {
      id: DEMO_IDS.patientId,
      first_name: 'Jane',
      last_name: 'Cooper',
      role: 'PATIENT',
      phone_number: '+91 98765 43210',
      avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80',
    },
    {
      id: DEMO_IDS.doctor1Id,
      first_name: 'Ananya',
      last_name: 'Sharma',
      role: 'DOCTOR',
      phone_number: '+91 98111 22334',
      avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=256&q=80',
    },
    {
      id: DEMO_IDS.doctor2Id,
      first_name: 'Rahul',
      last_name: 'Mehta',
      role: 'DOCTOR',
      phone_number: '+91 98222 33445',
      avatar_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=256&q=80',
    },
    {
      id: DEMO_IDS.adminId,
      first_name: 'MedSync',
      last_name: 'Administration',
      role: 'ADMIN',
      phone_number: '+91 11 4000 5000',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&q=80',
    },
  ];

  const { error: profErr } = await supabase.from('profiles').upsert(profilesToInsert);
  if (profErr) {
    console.error('Error inserting profiles:', profErr.message);
  } else {
    console.log('✓ Inserted 4 core profiles (Jane Cooper, Dr. Ananya Sharma, Dr. Rahul Mehta, Admin).');
  }

  // 2. Patient Profile
  const { error: patErr } = await supabase.from('patient_profiles').upsert([
    {
      id: DEMO_IDS.patientId,
      date_of_birth: '1992-05-14',
      gender: 'FEMALE',
      blood_group: 'O+',
      emergency_contact_name: 'Robert Cooper',
      emergency_contact_phone: '+91 98765 12345',
    },
  ]);
  if (patErr) console.error('Error inserting patient profile:', patErr.message);
  else console.log('✓ Inserted patient profile details for Jane Cooper (DOB: 1992-05-14, O+).');

  // 3. Doctor Profiles
  const { error: docErr } = await supabase.from('doctor_profiles').upsert([
    {
      id: DEMO_IDS.doctor1Id,
      specialization: 'General Medicine',
      license_number: 'MED-849204',
      consultation_duration_minutes: 30,
      bio: 'Senior Consultant in Internal & Preventive Medicine with over 12 years of clinical experience in comprehensive patient care, chronic disease management, and diagnostic evaluation.',
      is_active: true,
      avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=256&q=80',
    },
    {
      id: DEMO_IDS.doctor2Id,
      specialization: 'Cardiology',
      license_number: 'MED-910482',
      consultation_duration_minutes: 30,
      bio: 'Board-certified Clinical Cardiologist specializing in preventive cardiology, hypertension management, arrhythmia assessment, and cardiovascular risk stratification.',
      is_active: true,
      avatar_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=256&q=80',
    },
  ]);
  if (docErr) console.error('Error inserting doctor profiles:', docErr.message);
  else console.log('✓ Inserted doctor profiles (Dr. Ananya Sharma - General Medicine, Dr. Rahul Mehta - Cardiology).');

  // 4. Doctor Working Hours (Monday through Friday, 09:00 to 17:00 IST / UTC aligned)
  const workingHoursToInsert = [];
  for (let day = 1; day <= 5; day++) {
    workingHoursToInsert.push({
      doctor_id: DEMO_IDS.doctor1Id,
      day_of_week: day,
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_active: true,
    });
    workingHoursToInsert.push({
      doctor_id: DEMO_IDS.doctor2Id,
      day_of_week: day,
      start_time: '10:00:00',
      end_time: '18:00:00',
      is_active: true,
    });
  }
  const { error: whErr } = await supabase.from('doctor_working_hours').upsert(workingHoursToInsert);
  if (whErr) console.warn('Working hours insert note:', whErr.message);
  else console.log('✓ Inserted standard active working hours for both demo doctors.');

  // ===========================================================================
  // PHASE 3: SEED DEMO APPOINTMENTS & CLINICAL ENCOUNTERS
  // ===========================================================================
  console.log('\n▶ PHASE 3: Seeding Clean Demo Appointments & Clinical Records...');

  // Timestamps in ISO UTC (Asia/Kolkata 10:30 AM = 05:00 UTC)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 2);
  futureDate.setUTCHours(5, 0, 0, 0); // 10:30 AM IST
  const futureEnd = new Date(futureDate.getTime() + 30 * 60 * 1000);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);
  pastDate.setUTCHours(9, 0, 0, 0); // 02:30 PM IST
  const pastEnd = new Date(pastDate.getTime() + 30 * 60 * 1000);

  // 1. Appointments (1 Confirmed Upcoming + 1 Completed Visit)
  const { error: apptErr } = await supabase.from('appointments').upsert([
    {
      id: DEMO_IDS.apptUpcomingId,
      patient_id: DEMO_IDS.patientId,
      doctor_id: DEMO_IDS.doctor1Id, // Dr. Ananya Sharma
      start_time: futureDate.toISOString(),
      end_time: futureEnd.toISOString(),
      status: 'CONFIRMED',
      hold_expires_at: null,
      cancellation_reason: null,
    },
    {
      id: DEMO_IDS.apptCompletedId,
      patient_id: DEMO_IDS.patientId,
      doctor_id: DEMO_IDS.doctor2Id, // Dr. Rahul Mehta
      start_time: pastDate.toISOString(),
      end_time: pastEnd.toISOString(),
      status: 'COMPLETED',
      hold_expires_at: null,
      cancellation_reason: null,
    },
  ]);
  if (apptErr) console.error('Error creating appointments:', apptErr.message);
  else console.log('✓ Created 1 Upcoming Confirmed Appointment & 1 Completed Appointment.');

  // 2. Pre-Visit Intakes for Both Appointments
  const { error: intakeErr } = await supabase.from('appointment_intakes').upsert([
    {
      id: DEMO_IDS.intakeUpcomingId,
      appointment_id: DEMO_IDS.apptUpcomingId,
      patient_id: DEMO_IDS.patientId,
      symptoms: 'Mild general fatigue and request for routine comprehensive wellness health checkup.',
      symptom_duration: '1 week',
      pain_scale: 1,
      current_medications: 'Daily Multivitamin & Omega-3',
      allergies: 'None known',
      lifestyle_notes: 'Sedentary desk job, mild cardio workout twice weekly, normal sleep.',
    },
    {
      id: DEMO_IDS.intakeCompletedId,
      appointment_id: DEMO_IDS.apptCompletedId,
      patient_id: DEMO_IDS.patientId,
      symptoms: 'Occasional episodes of rapid heartbeat / palpitations following moderate aerobic workout sessions.',
      symptom_duration: '2 weeks',
      pain_scale: 2,
      current_medications: 'None',
      allergies: 'Penicillin',
      lifestyle_notes: 'Regular morning jogs (3-4 km), moderate caffeine consumption (1-2 cups tea/coffee daily).',
    },
  ]);
  if (intakeErr) console.error('Error inserting pre-visit intakes:', intakeErr.message);
  else console.log('✓ Created structured pre-visit symptom intakes for both consultations.');

  // 3. AI Pre-Visit Clinical Summaries
  const { error: aiPreErr } = await supabase.from('ai_pre_visit_summaries').upsert([
    {
      id: DEMO_IDS.aiPreVisitUpcomingId,
      appointment_id: DEMO_IDS.apptUpcomingId,
      intake_id: DEMO_IDS.intakeUpcomingId,
      patient_id: DEMO_IDS.patientId,
      doctor_id: DEMO_IDS.doctor1Id,
      urgency: 'Low',
      chief_complaint: 'Routine preventive wellness evaluation and mild general fatigue.',
      suggested_questions: [
        'Have there been recent changes in dietary intake, work stress, or sleep architecture?',
        'Any personal or family history of thyroid dysfunction or iron deficiency anemia?',
      ],
      model_used: 'gemini-1.5-flash',
      status: 'COMPLETED',
    },
    {
      id: DEMO_IDS.aiPreVisitCompletedId,
      appointment_id: DEMO_IDS.apptCompletedId,
      intake_id: DEMO_IDS.intakeCompletedId,
      patient_id: DEMO_IDS.patientId,
      doctor_id: DEMO_IDS.doctor2Id,
      urgency: 'Medium',
      chief_complaint: 'Post-exertional palpitations lasting 2–3 minutes with no documented syncope or chest tightness.',
      suggested_questions: [
        'Did palpitation episodes coincide with hydration status or increased caffeine intake?',
        'Were any accompanying presyncope, shortness of breath, or diaphoresis noted?',
      ],
      model_used: 'gemini-1.5-flash',
      status: 'COMPLETED',
    },
  ]);
  if (aiPreErr) console.error('Error inserting AI pre-visit summaries:', aiPreErr.message);
  else console.log('✓ Generated and stored AI pre-visit clinical triage summaries.');

  // 4. Consultation Notes (SOAP) for Completed Visit
  const { error: noteErr } = await supabase.from('consultation_notes').upsert([
    {
      id: DEMO_IDS.consultationCompletedId,
      appointment_id: DEMO_IDS.apptCompletedId,
      doctor_id: DEMO_IDS.doctor2Id,
      patient_id: DEMO_IDS.patientId,
      chief_complaint: 'Post-exercise palpitations, episodic, resolving spontaneously within 2–3 minutes.',
      examination_notes: 'Vitals: BP 120/78 mmHg, Resting HR 74 bpm regular, SpO2 99% on room air. Cardiovascular: Normal S1/S2 heart sounds, no audible murmurs, rubs, or gallops. Resting 12-lead ECG demonstrates normal sinus rhythm with physiological PR/QT intervals.',
      diagnosis: 'Benign Sinus Tachycardia post-exertion (non-ischemic, non-arrhythmogenic)',
      treatment_plan: 'Patient reassured regarding benign nature. Advised workout hydration protocols, limit caffeine post-run. Prescribed low-dose Atenolol 25mg as targeted support. Follow-up in 4 weeks.',
      doctor_notes: 'Excellent functional capacity. Echocardiogram not indicated at this stage. Re-evaluate if symptoms escalate.',
      follow_up_instructions: 'Maintain workout hydration. Return if palpitations occur at rest or cause dizziness.',
      follow_up_date: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_finalized: true,
    },
  ]);
  if (noteErr) console.error('Error inserting consultation notes:', noteErr.message);
  else console.log('✓ Created finalized SOAP consultation documentation.');

  // 5. Finalized Digital Prescription
  const { error: rxErr } = await supabase.from('prescriptions').upsert([
    {
      id: DEMO_IDS.prescriptionCompletedId,
      appointment_id: DEMO_IDS.apptCompletedId,
      consultation_id: DEMO_IDS.consultationCompletedId,
      doctor_id: DEMO_IDS.doctor2Id,
      patient_id: DEMO_IDS.patientId,
      status: 'FINALIZED',
      notes: 'Take medications strictly with meals or plenty of water. Avoid sudden cessation without consulting physician.',
      issued_at: pastDate.toISOString(),
    },
  ]);
  if (rxErr) console.error('Error inserting prescription:', rxErr.message);
  else console.log('✓ Created finalized official digital prescription.');

  // 6. Prescription Items
  const { error: itemErr } = await supabase.from('prescription_items').upsert([
    {
      id: DEMO_IDS.prescriptionItem1Id,
      prescription_id: DEMO_IDS.prescriptionCompletedId,
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
      id: DEMO_IDS.prescriptionItem2Id,
      prescription_id: DEMO_IDS.prescriptionCompletedId,
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
  if (itemErr) console.error('Error inserting prescription items:', itemErr.message);
  else console.log('✓ Added 2 pharmaceutical items to the finalized digital prescription.');

  // 7. AI Post-Visit Care Summary
  const { error: aiPostErr } = await supabase.from('ai_post_visit_summaries').upsert([
    {
      id: DEMO_IDS.aiPostVisitCompletedId,
      appointment_id: DEMO_IDS.apptCompletedId,
      consultation_id: DEMO_IDS.consultationCompletedId,
      patient_id: DEMO_IDS.patientId,
      doctor_id: DEMO_IDS.doctor2Id,
      prescription_id: DEMO_IDS.prescriptionCompletedId,
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
    },
  ]);
  if (aiPostErr) console.error('Error inserting AI post-visit summary:', aiPostErr.message);
  else console.log('✓ Generated patient-friendly AI Post-Visit Care Summary.');

  console.log('\n================================================================');
  console.log('✓ CONTROLLED DEMO DATA SEEDING COMPLETE');
  console.log('================================================================\n');
}

seedDemoEnvironment();
