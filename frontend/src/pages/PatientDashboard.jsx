import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  UserIcon,
  CalendarIcon,
  ActivityIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  StethoscopeIcon,
  SearchIcon,
  FilterIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  BadgeCheckIcon,
  SparklesIcon,
  FileTextIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  BellIcon,
  PhoneIcon,
} from '../components/Icons';

import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { CalendarConnectButton } from '../components/CalendarConnectButton';

const backendUrl = API_BASE_URL;

// ─── Utility Helpers ──────────────────────────────────────────────────────────


function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SPECIALTIES = [
  'All Specialties',
  'General Medicine',
  'Cardiology',
  'Dermatology',
  'Pediatrics',
  'Neurology',
  'Orthopedics',
  'Internal Medicine',
  'Psychiatry',
];

const SEVERITY_LEVELS = [
  { id: 'MILD', label: 'Mild', color: '#15803d', bg: '#dcfce7' },
  { id: 'MODERATE', label: 'Moderate', color: '#854d0e', bg: '#fef9c3' },
  { id: 'SEVERE', label: 'Severe', color: '#c2410c', bg: '#ffedd5' },
  { id: 'CRITICAL', label: 'Critical', color: '#b91c1c', bg: '#fee2e2' },
];

const PROGRESSION_OPTIONS = [
  { id: 'BETTER', label: 'Getting Better' },
  { id: 'SAME', label: 'About the Same' },
  { id: 'WORSE', label: 'Getting Worse' },
  { id: 'FLUCTUATING', label: 'Fluctuating / Comes & Goes' },
];

function generateTimeSlots(workingHours, date, durationMinutes = 30, leaves = [], existingAppts = [], activeHolds = []) {
  if (!date) return [];
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  
  // 1. Filter active hours for this day of week
  const rawDayHours = (workingHours || []).filter(
    (wh) => wh.day_of_week === dayOfWeek && wh.is_active
  );

  let dayHours = rawDayHours;
  if (dayHours.length === 0 && (!workingHours || workingHours.length === 0)) {
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      dayHours = [{ start_time: '09:00:00', end_time: '17:00:00' }];
    }
  }

  // Deduplicate identical or overlapping working hour windows for the same day
  const seenWindows = new Set();
  const uniqueWindows = [];
  for (const wh of dayHours) {
    const key = `${wh.start_time || '09:00:00'}-${wh.end_time || '17:00:00'}`;
    if (!seenWindows.has(key)) {
      seenWindows.add(key);
      uniqueWindows.push(wh);
    }
  }

  const now = new Date();
  // Map keyed by epoch timestamp guarantees strict uniqueness
  const slotMap = new Map();

  for (const wh of uniqueWindows) {
    const [sh, sm] = (wh.start_time || '09:00').split(':').map(Number);
    const [eh, em] = (wh.end_time || '17:00').split(':').map(Number);

    const workStart = new Date(date + 'T00:00:00');
    workStart.setHours(sh, sm, 0, 0);

    const workEnd = new Date(date + 'T00:00:00');
    workEnd.setHours(eh, em, 0, 0);

    const cursor = new Date(workStart);

    while (cursor < workEnd) {
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
      if (slotEnd > workEnd) break;

      const isPast = cursor <= now;

      const inLeave = (leaves || []).some((l) => {
        const ls = new Date(l.start_time);
        const le = new Date(l.end_time);
        return cursor < le && slotEnd > ls;
      });

      const hasApptConflict = (existingAppts || []).some((a) => {
        const as = new Date(a.start_time);
        const ae = new Date(a.end_time);
        return cursor < ae && slotEnd > as;
      });

      const hasHoldConflict = (activeHolds || []).some((h) => {
        const hs = new Date(h.start_time);
        const he = new Date(h.end_time);
        return cursor < he && slotEnd > hs;
      });

      if (!isPast && !inLeave && !hasApptConflict && !hasHoldConflict) {
        const timeKey = cursor.getTime();
        if (!slotMap.has(timeKey)) {
          slotMap.set(timeKey, {
            start: new Date(cursor),
            end: new Date(slotEnd),
          });
        }
      }

      cursor.setTime(cursor.getTime() + durationMinutes * 60_000);
    }
  }

  // Return chronologically sorted unique slots
  return Array.from(slotMap.values()).sort((a, b) => a.start - b.start);
}

// ─── Status Badge Component ───────────────────────────────────────────────────

function StatusBadge({ status }) {
  const isConfirmed = status === 'CONFIRMED';
  const isHeld = status === 'HELD';
  const isCompleted = status === 'COMPLETED';
  const isCancelled = status === 'CANCELLED';

  const pillClass = isConfirmed
    ? 'confirmed'
    : isHeld
      ? 'held'
      : isCompleted
        ? 'completed'
        : isCancelled
          ? 'cancelled'
          : 'confirmed';

  const label = isConfirmed
    ? 'CONFIRMED'
    : isHeld
      ? 'HELD (10m)'
      : isCompleted
        ? 'COMPLETED'
        : isCancelled
          ? 'CANCELLED'
          : status;

  return (
    <span className={`status-pill ${pillClass}`}>
      <span className={`status-dot ${pillClass}`}></span>
      {label}
    </span>
  );
}



const formLabelStyle = {

  display: 'block',
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: '0.45rem',
};

const formInputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  fontSize: '1rem',
  border: '1.5px solid #cbd5e1',
  borderRadius: '10px',
  color: '#0f172a',
  background: '#ffffff',
  outline: 'none',
  lineHeight: 1.5,
};

export const PatientDashboard = () => {

  const { user, profile } = useAuth();

  // Navigation Tab: 'doctors' | 'appointments' | 'prescriptions' | 'history' | 'profile'
  const [activeTab, setActiveTab] = useState('doctors');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All Specialties');

  // Doctors State
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [doctorsError, setDoctorsError] = useState('');

  // Appointments, Intakes, Notes & Prescriptions State
  const [appointments, setAppointments] = useState([]);
  const [intakes, setIntakes] = useState({});
  const [consultNotes, setConsultNotes] = useState({});
  const [prescriptions, setPrescriptions] = useState([]);
  const [medReminders, setMedReminders] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError, setCancelError] = useState('');

  // Booking Flow State
  const [modalStep, setModalStep] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [visitReason, setVisitReason] = useState('');
  const [activeHold, setActiveHold] = useState(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(600);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedAppt, setConfirmedAppt] = useState(null);

  // Pre-Visit Intake Modal State
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [activeApptForIntake, setActiveApptForIntake] = useState(null);
  const [intakeForm, setIntakeForm] = useState({
    chief_complaint: '',
    symptoms: '',
    symptom_onset: '',
    severity: 'MODERATE',
    progression: 'SAME',
    current_medications: '',
    allergies: '',
    existing_conditions: '',
    additional_notes: '',
  });
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [intakeSuccessNotice, setIntakeSuccessNotice] = useState('');

  // View Clinical Consultation Summary Modal (Patient side)
  const [viewingConsultNote, setViewingConsultNote] = useState(null);
  const [viewingConsultAppt, setViewingConsultAppt] = useState(null);
  const [aiPostSummary, setAiPostSummary] = useState(null);
  const [aiPostSummaryLoading, setAiPostSummaryLoading] = useState(false);
  const [aiPostSummaryError, setAiPostSummaryError] = useState('');
  const [showRawDoctorNotes, setShowRawDoctorNotes] = useState(false);

  // View E-Prescription Modal (Patient side)
  const [viewingRx, setViewingRx] = useState(null);

  // ── Compute Full Dynamic Daily Medication Schedule ──
  const dailyMedicationSchedule = useMemo(() => {
    const scheduleItems = [];

    // 1. From database medication_reminders table
    if (Array.isArray(medReminders) && medReminders.length > 0) {
      medReminders.forEach((rem) => {
        const timeStr = rem.reminder_time ? rem.reminder_time.substring(0, 5) : '08:00';
        const hour = parseInt(timeStr.split(':')[0], 10);
        const period = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
        const timeFormatted = `${hour % 12 === 0 ? 12 : hour % 12}:${timeStr.split(':')[1]} ${hour >= 12 ? 'PM' : 'AM'}`;

        let remainingDaysText = '';
        if (rem.end_date) {
          const endDate = new Date(rem.end_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
          remainingDaysText = diffDays > 0 ? `${diffDays} days remaining` : 'Course completed';
        }

        scheduleItems.push({
          id: rem.id,
          timeStr,
          timeFormatted,
          period: `${period} Dose`,
          medication_name: rem.medication_name,
          dosage: rem.dosage || '1 dose',
          frequency: rem.frequency,
          instructions: rem.instructions || 'Take as directed',
          status: 'UPCOMING',
          start_date: rem.start_date,
          end_date: rem.end_date,
          treatmentText: rem.start_date && rem.end_date ? `Treatment: ${rem.start_date} → ${rem.end_date}` : 'Treatment active',
          remainingDaysText,
          route: 'Oral (PO)',
          is_active: rem.is_active,
        });
      });
    }

    // 2. Dynamic fallback / augmentation from active prescriptions
    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      prescriptions.forEach((rx) => {
        const items = rx.prescription_items || [];
        items.forEach((item) => {
          // If already in schedule from DB, avoid duplicate
          const alreadyPresent = scheduleItems.some(
            (s) => s.medication_name?.toLowerCase() === item.medication_name?.toLowerCase()
          );
          if (alreadyPresent) return;

          const freqLower = (item.frequency || '').toLowerCase();
          const slots = [];

          if (
            freqLower.includes('once') ||
            freqLower.includes('twice') ||
            freqLower.includes('three') ||
            freqLower.includes('four') ||
            freqLower.includes('morning') ||
            freqLower.includes('bid') ||
            freqLower.includes('tid') ||
            freqLower.includes('qid') ||
            freqLower.includes('daily') ||
            freqLower.includes('8 hour') ||
            freqLower.includes('6 hour')
          ) {
            slots.push({ timeStr: '08:00', timeFormatted: '08:00 AM', period: 'Morning Dose' });
          }

          if (
            freqLower.includes('three') ||
            freqLower.includes('four') ||
            freqLower.includes('tid') ||
            freqLower.includes('qid') ||
            freqLower.includes('afternoon') ||
            freqLower.includes('8 hour') ||
            freqLower.includes('6 hour')
          ) {
            slots.push({ timeStr: '14:00', timeFormatted: '02:00 PM', period: 'Afternoon Dose' });
          }

          if (
            freqLower.includes('twice') ||
            freqLower.includes('three') ||
            freqLower.includes('four') ||
            freqLower.includes('night') ||
            freqLower.includes('bedtime') ||
            freqLower.includes('evening') ||
            freqLower.includes('bid') ||
            freqLower.includes('tid') ||
            freqLower.includes('qid') ||
            freqLower.includes('8 hour') ||
            freqLower.includes('6 hour')
          ) {
            slots.push({ timeStr: '20:00', timeFormatted: '08:00 PM', period: 'Evening / Night Dose' });
          }

          if (freqLower.includes('four') || freqLower.includes('qid') || freqLower.includes('6 hour')) {
            slots.push({ timeStr: '22:00', timeFormatted: '10:00 PM', period: 'Bedtime Dose' });
          }

          if (slots.length === 0) {
            slots.push({ timeStr: '08:00', timeFormatted: '08:00 AM', period: 'Morning Dose' });
          }

          let durationDays = 7;
          const parsedDays = parseInt((item.duration || '').replace(/\D/g, ''), 10);
          if (!isNaN(parsedDays) && parsedDays > 0) durationDays = parsedDays;

          const issuedDate = rx.issued_at ? new Date(rx.issued_at) : new Date(rx.created_at || Date.now());
          const today = new Date();
          const elapsed = Math.floor((today - issuedDate) / (1000 * 60 * 60 * 24));
          const remaining = Math.max(0, durationDays - elapsed);

          slots.forEach((slot, sIdx) => {
            scheduleItems.push({
              id: `dyn_${item.id || item.medication_name}_${sIdx}`,
              timeStr: slot.timeStr,
              timeFormatted: slot.timeFormatted,
              period: slot.period,
              medication_name: item.medication_name,
              strength: item.strength,
              dosage: item.dosage || '1 dose',
              frequency: item.frequency,
              route: item.route || 'Oral (PO)',
              duration: item.duration || `${durationDays} days`,
              instructions: item.instructions || 'Take after meals',
              status: 'UPCOMING',
              treatmentText: `Treatment: ${durationDays} days`,
              remainingDaysText: `Remaining: ${remaining} days`,
              is_active: true,
            });
          });
        });
      });
    }

    return scheduleItems.sort((a, b) => a.timeStr.localeCompare(b.timeStr));
  }, [medReminders, prescriptions]);

  // ── Fetch Doctors ──
  const fetchDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    setDoctorsError('');

    const { data, error } = await supabase
      .from('doctor_profiles')
      .select(`
        id,
        specialization,
        license_number,
        bio,
        consultation_duration_minutes,
        is_active,
        profiles (
          first_name,
          last_name,
          phone_number,
          avatar_url
        )
      `)
      .eq('is_active', true);

    if (error) {
      console.error('Error loading doctors:', error);
      setDoctorsError('Could not load medical providers. Please try again.');
    } else {
      setDoctors(data || []);
    }
    setDoctorsLoading(false);
  }, []);

  // ── Fetch Appointments, Intakes, Notes & Prescriptions ──
  const fetchAppointmentsAndIntakes = useCallback(async () => {
    if (!user?.id) return;
    setApptLoading(true);
    setApptError('');

    try {
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select(`
          id,
          patient_id,
          doctor_id,
          start_time,
          end_time,
          status,
          hold_expires_at,
          cancellation_reason,
          created_at,
          doctor_profiles (
            specialization,
            license_number,
            consultation_duration_minutes,
            profiles (
              first_name,
              last_name,
              phone_number
            )
          )
        `)
        .eq('patient_id', user.id)
        .order('start_time', { ascending: false });

      if (apptErr) throw apptErr;

      setAppointments(apptData || []);

      // Fetch linked intakes
      try {
        const { data: intakeData } = await supabase
          .from('appointment_intakes')
          .select('*')
          .eq('patient_id', user.id);

        if (intakeData) {
          const mapped = {};
          intakeData.forEach((item) => {
            mapped[item.appointment_id] = item;
          });
          setIntakes(mapped);
        }
      } catch {
        // optional table
      }

      // Fetch linked consultation notes
      try {
        const { data: notesData } = await supabase
          .from('consultation_notes')
          .select('*')
          .eq('patient_id', user.id);

        if (notesData) {
          const notesMap = {};
          notesData.forEach((note) => {
            notesMap[note.appointment_id] = note;
          });
          setConsultNotes(notesMap);
        }
      } catch {
        // optional table
      }

      // Fetch linked prescriptions & items
      try {
        const { data: rxData } = await supabase
          .from('prescriptions')
          .select(`
            id,
            appointment_id,
            consultation_id,
            status,
            notes,
            issued_at,
            created_at,
            prescription_items (*),
            doctor_profiles (
              specialization,
              license_number,
              profiles (
                first_name,
                last_name
              )
            ),
            appointments (
              start_time
            ),
            consultation_notes (
              diagnosis
            )
          `)
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false });

        if (rxData) {
          setPrescriptions(rxData);
        }
      } catch {
        // optional table
      }

      // Fetch automated medication reminders based on prescription frequency
      try {
        const { data: remData } = await supabase
          .from('medication_reminders')
          .select('*')
          .eq('patient_id', user.id)
          .order('reminder_time', { ascending: true });

        if (remData) {
          setMedReminders(remData);
        }
      } catch {
        // optional table
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setApptError('Could not load your appointments. Please refresh the page.');
    } finally {
      setApptLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDoctors();
    fetchAppointmentsAndIntakes();
  }, [fetchDoctors, fetchAppointmentsAndIntakes]);

  // ── Hold Countdown Timer ──
  useEffect(() => {
    if (!activeHold || modalStep !== 'review') return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(activeHold.expires_at) - new Date()) / 1000));
      setHoldSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        setActiveHold(null);
        setBookingError('Your reservation hold has expired. Please select a time slot again.');
        setModalStep('slots');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeHold, modalStep]);

  // ── Fetch Slots ──
  useEffect(() => {
    if (!selectedDoctor || !selectedDate || (modalStep !== 'slots' && modalStep !== 'profile')) return;

    let isSubscribed = true;

    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError('');
      setSlots([]);

      try {
        const { data: wh } = await supabase
          .from('doctor_working_hours')
          .select('*')
          .eq('doctor_id', selectedDoctor.id)
          .eq('is_active', true);

        const dayStart = new Date(selectedDate + 'T00:00:00');
        const dayEnd = new Date(selectedDate + 'T23:59:59');

        const { data: leaves } = await supabase
          .from('doctor_leaves')
          .select('start_time, end_time')
          .eq('doctor_id', selectedDoctor.id)
          .lte('start_time', dayEnd.toISOString())
          .gte('end_time', dayStart.toISOString());

        const { data: existingAppts } = await supabase
          .from('appointments')
          .select('start_time, end_time, status')
          .eq('doctor_id', selectedDoctor.id)
          .in('status', ['HELD', 'CONFIRMED'])
          .lte('start_time', dayEnd.toISOString())
          .gte('end_time', dayStart.toISOString());

        let activeHolds = [];
        try {
          const { data: holdsData } = await supabase
            .from('appointment_holds')
            .select('start_time, end_time, expires_at, status')
            .eq('doctor_id', selectedDoctor.id)
            .eq('status', 'ACTIVE')
            .gt('expires_at', new Date().toISOString())
            .lte('start_time', dayEnd.toISOString())
            .gte('end_time', dayStart.toISOString());
          if (holdsData) activeHolds = holdsData;
        } catch {
          // optional
        }

        const generated = generateTimeSlots(
          wh,
          selectedDate,
          selectedDoctor.consultation_duration_minutes || 30,
          leaves || [],
          existingAppts || [],
          activeHolds
        );

        if (isSubscribed) {
          setSlots(generated);
          if (generated.length === 0) {
            setSlotsError('No available consultation slots for this date. Please choose another date.');
          }
        }
      } catch (err) {
        console.error('Error generating slots:', err);
        if (isSubscribed) setSlotsError('Failed to load doctor schedule.');
      } finally {
        if (isSubscribed) setSlotsLoading(false);
      }
    };

    loadSlots();

    return () => {
      isSubscribed = false;
    };
  }, [selectedDoctor?.id, selectedDate, modalStep]);

  // ── Open Booking Flow ──
  const startBooking = (doctor) => {
    setSelectedDoctor(doctor);
    setSelectedDate(todayISO());
    setSelectedSlot(null);
    setActiveHold(null);
    setBookingError('');
    setVisitReason('');
    setModalStep('slots');
  };

  const handleSelectSlot = async (slot) => {
    setSelectedSlot(slot);
    setBookingError('');

    const holdExpiration = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    let createdHold = {
      doctor_id: selectedDoctor.id,
      start_time: slot.start.toISOString(),
      end_time: slot.end.toISOString(),
      expires_at: holdExpiration,
    };

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_appointment_hold', {
        p_doctor_id: selectedDoctor.id,
        p_start_time: slot.start.toISOString(),
        p_end_time: slot.end.toISOString(),
        p_hold_duration_minutes: 10,
      });

      if (!rpcError && rpcData?.success) {
        createdHold = rpcData;
      }
    } catch {
      // client fallback
    }

    setActiveHold(createdHold);
    setHoldSecondsLeft(600);
    setModalStep('review');
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !selectedDoctor || !user?.id) return;
    setBookingInProgress(true);
    setBookingError('');

    try {
      let bookingSuccess = false;
      let apptRecord = null;

      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('book_appointment_atomic', {
          p_doctor_id: selectedDoctor.id,
          p_start_time: selectedSlot.start.toISOString(),
          p_end_time: selectedSlot.end.toISOString(),
          p_status: 'CONFIRMED',
          p_hold_duration_minutes: 0,
        });

        if (!rpcErr && rpcRes) {
          if (rpcRes.success) {
            bookingSuccess = true;
            const { data: fullAppt } = await supabase
              .from('appointments')
              .select(`
                id,
                patient_id,
                doctor_id,
                start_time,
                end_time,
                status,
                created_at,
                doctor_profiles (
                  specialization,
                  license_number,
                  profiles (
                    first_name,
                    last_name
                  )
                )
              `)
              .eq('id', rpcRes.appointment_id)
              .single();

            apptRecord = fullAppt || {
              id: rpcRes.appointment_id,
              start_time: rpcRes.start_time,
              end_time: rpcRes.end_time,
              status: rpcRes.status || 'CONFIRMED',
              doctor_profiles: selectedDoctor,
            };
          } else {
            setBookingError(rpcRes.message || 'This time slot is no longer available. Please choose another time.');
            setBookingInProgress(false);
            return;
          }
        }
      } catch {
        // Fallback
      }

      if (!bookingSuccess) {
        const { data, error } = await supabase
          .from('appointments')
          .insert({
            patient_id: user.id,
            doctor_id: selectedDoctor.id,
            start_time: selectedSlot.start.toISOString(),
            end_time: selectedSlot.end.toISOString(),
            status: 'CONFIRMED',
            hold_expires_at: null,
          })
          .select(`
            id,
            patient_id,
            doctor_id,
            start_time,
            end_time,
            status,
            created_at,
            doctor_profiles (
              specialization,
              license_number,
              profiles (
                first_name,
                last_name
              )
            )
          `)
          .single();

        if (error) {
          const isConflict =
            error.code === '23P01' ||
            error.message?.toLowerCase().includes('exclusion') ||
            error.message?.toLowerCase().includes('prevent_overlapping') ||
            error.message?.toLowerCase().includes('leave');

          setBookingError(
            isConflict
              ? 'This time slot is no longer available (already booked or held). Please select another time.'
              : 'Booking failed: ' + error.message
          );
          setBookingInProgress(false);
          return;
        }

        apptRecord = data;
      }

      setConfirmedAppt(apptRecord);
      setModalStep('success');
      fetchAppointmentsAndIntakes();

      // Asynchronously trigger Google Calendar sync in background (non-blocking)
      if (apptRecord?.id) {
        console.log('[Calendar Sync] Starting sync', {
          appointmentId: apptRecord.id,
          userId: user.id,
          action: 'create',
        });

        supabase.auth.getSession().then(async ({ data: sData }) => {
          const t = sData?.session?.access_token;
          if (t) {
            try {
              const syncRes = await fetch(`${backendUrl}/calendar/sync/${apptRecord.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                body: JSON.stringify({ action: 'create' }),
              });
              const syncJson = await syncRes.json();
              console.log('[Calendar Sync] HTTP response', {
                status: syncRes.status,
                responseBody: syncJson,
              });
            } catch (e) {
              console.warn('[Calendar Sync] Background calendar sync error:', e);
            }
          }
        });
      }

    } catch (err) {
      console.error('Booking confirmation error:', err);
      setBookingError('An unexpected error occurred. Please try again.');
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleCancel = async (apptId) => {
    setCancellingId(apptId);
    setCancelError('');

    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'CANCELLED',
        hold_expires_at: null,
        cancellation_reason: 'Cancelled by patient from portal',
      })
      .eq('id', apptId)
      .eq('patient_id', user.id);

    if (error) {
      setCancelError('Failed to cancel appointment: ' + error.message);
    } else {
      fetchAppointmentsAndIntakes();

      // Trigger calendar cancellation sync
      supabase.auth.getSession().then(({ data: sData }) => {
        const t = sData?.session?.access_token;
        if (t) {
          fetch(`${backendUrl}/calendar/sync/${apptId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({ action: 'cancel' }),
          }).catch((e) => console.warn('Background calendar cancel sync error:', e));
        }
      });
    }
    setCancellingId(null);

  };

  // ── Open Pre-Visit Intake Modal ──
  const openIntakeModal = (appt) => {
    setActiveApptForIntake(appt);
    setIntakeError('');
    setIntakeSuccessNotice('');

    const existing = intakes[appt.id];
    if (existing) {
      setIntakeForm({
        chief_complaint: existing.chief_complaint || '',
        symptoms: existing.symptoms || '',
        symptom_onset: existing.symptom_onset || '',
        severity: existing.severity || 'MODERATE',
        progression: existing.progression || 'SAME',
        current_medications: existing.current_medications || '',
        allergies: existing.allergies || '',
        existing_conditions: existing.existing_conditions || '',
        additional_notes: existing.additional_notes || '',
      });
    } else {
      setIntakeForm({
        chief_complaint: '',
        symptoms: '',
        symptom_onset: '',
        severity: 'MODERATE',
        progression: 'SAME',
        current_medications: '',
        allergies: '',
        existing_conditions: '',
        additional_notes: '',
      });
    }

    setIntakeModalOpen(true);
  };

  const handleSaveIntake = async (e) => {
    e.preventDefault();
    if (!activeApptForIntake || !user?.id) return;
    setIntakeSaving(true);
    setIntakeError('');
    setIntakeSuccessNotice('');

    try {
      if (!intakeForm.chief_complaint.trim()) {
        throw new Error('Please specify the main reason for consultation.');
      }
      if (!intakeForm.symptoms.trim()) {
        throw new Error('Please describe your current symptoms.');
      }

      const payload = {
        appointment_id: activeApptForIntake.id,
        patient_id: user.id,
        doctor_id: activeApptForIntake.doctor_id,
        chief_complaint: intakeForm.chief_complaint.trim(),
        symptoms: intakeForm.symptoms.trim(),
        symptom_onset: intakeForm.symptom_onset.trim() || null,
        severity: intakeForm.severity,
        progression: intakeForm.progression,
        current_medications: intakeForm.current_medications.trim() || null,
        allergies: intakeForm.allergies.trim() || null,
        existing_conditions: intakeForm.existing_conditions.trim() || null,
        additional_notes: intakeForm.additional_notes.trim() || null,
      };

      const existing = intakes[activeApptForIntake.id];
      let res;
      if (existing?.id) {
        res = await supabase
          .from('appointment_intakes')
          .update(payload)
          .eq('id', existing.id);
      } else {
        res = await supabase
          .from('appointment_intakes')
          .insert(payload);
      }

      if (res.error) throw res.error;

      setIntakeSuccessNotice('Pre-visit intake submitted successfully!');
      fetchAppointmentsAndIntakes();

      // Trigger background AI pre-visit summary generation
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          fetch(`${backendUrl}/ai/pre-visit-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ appointment_id: activeApptForIntake.id }),
          }).catch((e) => console.warn('Background AI pre-visit notice:', e));
        }
      } catch {
        // Non-blocking for appointment/intake workflow
      }

      setTimeout(() => {
        setIntakeModalOpen(false);
      }, 1200);

    } catch (err) {
      console.error('Intake submission error:', err);
      setIntakeError(err.message || 'Failed to submit intake.');
    } finally {
      setIntakeSaving(false);
    }
  };

  // ── Fetch or Generate AI Post-Visit Care Summary ──
  const fetchOrGenerateAiPostSummary = async (apptId, consultNote, forceRegen = false) => {
    setAiPostSummaryLoading(true);
    setAiPostSummaryError('');
    try {
      // Find authoritative prescription for this appointment
      const rx = Array.isArray(prescriptions)
        ? prescriptions.find((p) => p.appointment_id === apptId)
        : prescriptions?.[apptId];
      const authoritativeMedItems = rx?.prescription_items || [];

      if (!forceRegen) {
        const { data: dbSummary } = await supabase
          .from('ai_post_visit_summaries')
          .select('*')
          .eq('appointment_id', apptId)
          .eq('status', 'COMPLETED')
          .maybeSingle();

        // Invalidate stale cache if database has prescriptions but summary has none
        if (dbSummary && (dbSummary.medications?.length || 0) === authoritativeMedItems.length) {
          setAiPostSummary(dbSummary);
          setAiPostSummaryLoading(false);
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      let apiSuccess = false;
      if (token) {
        try {
          const res = await fetch(`${backendUrl}/ai/post-visit-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ appointment_id: apptId, force_regenerate: true }),
          });

          if (res.ok) {
            const resJson = await res.json();
            if (resJson.success && resJson.data) {
              setAiPostSummary(resJson.data);
              apiSuccess = true;
            }
          }
        } catch (e) {
          console.warn('Backend AI post-visit endpoint call skipped/failed, using fallback:', e);
        }
      }

      if (!apiSuccess && consultNote) {
        // Authoritative fallback mapping strictly using verified database records
        const fallbackMedications = authoritativeMedItems.map((m) => ({
          name: m.medication_name,
          strength: m.strength || '',
          dosage: m.dosage || '1 dose',
          frequency: m.frequency || 'As directed',
          route: m.route || 'Oral (PO)',
          duration: m.duration || 'As prescribed',
          instructions: m.instructions || 'Take as advised by doctor',
        }));

        const PLACEHOLDER_DIAGNOSES = [
          '',
          'none',
          'null',
          'prescription consultation',
          'medication management',
          'clinical assessment',
          'clinical evaluation',
          'clinical checkup',
          'general consultation',
          'consultation',
          'not specified',
          'standard care',
          'draft assessment',
        ];
        const rawDiag = (consultNote.diagnosis || '').trim();
        const hasRealDiagnosis = rawDiag && !PLACEHOLDER_DIAGNOSES.includes(rawDiag.toLowerCase());

        const fallbackSummary = {
          appointment_id: apptId,
          summary: hasRealDiagnosis
            ? `During your consultation, your physician recorded the clinical assessment: "${rawDiag}". Treatment Plan: ${consultNote.treatment_plan?.trim() || consultNote.doctor_notes?.trim() || 'Follow prescribed care regimen.'}`
            : `During your consultation, your physician recorded your treatment plan and medication instructions. Care Plan: ${consultNote.treatment_plan?.trim() || consultNote.doctor_notes?.trim() || 'Follow prescribed care regimen.'}`,
          diagnosis_explanation: hasRealDiagnosis
            ? `Your physician recorded a diagnosis of "${rawDiag}". Please review your prescribed medications and instructions below.`
            : 'Diagnosis was not specified by the physician for this consultation.',
          medications: fallbackMedications,
          follow_up: {
            instructions: consultNote.follow_up_instructions || 'Schedule a follow-up if symptoms persist.',
            date: consultNote.follow_up_date || null,
          },
          model_used: 'clinical-rules-postvisit-v1',
        };
        setAiPostSummary(fallbackSummary);
      }

    } catch (err) {

      console.error('Error fetching AI post-visit summary:', err);
      setAiPostSummaryError('Could not load AI care summary.');
    } finally {
      setAiPostSummaryLoading(false);
    }
  };

  const handleOpenCareSummary = (appt, note) => {
    setViewingConsultAppt(appt);
    setViewingConsultNote(note);
    setShowRawDoctorNotes(false);
    setAiPostSummary(null);
    setAiPostSummaryError('');
    fetchOrGenerateAiPostSummary(appt.id, note, false);
  };


  // ── Filtered Data ──
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      const fullName = `Dr. ${doc.profiles?.first_name || ''} ${doc.profiles?.last_name || ''}`.toLowerCase();
      const spec = (doc.specialization || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchesSearch = !query || fullName.includes(query) || spec.includes(query) || (doc.license_number || '').toLowerCase().includes(query);
      const matchesSpecialty = selectedSpecialty === 'All Specialties' || doc.specialization === selectedSpecialty;

      return matchesSearch && matchesSpecialty;
    });
  }, [doctors, searchQuery, selectedSpecialty]);

  const now = new Date();
  const upcomingAppts = appointments.filter(
    (a) => new Date(a.start_time) >= now && a.status !== 'CANCELLED'
  );
  const pastAppts = appointments.filter(
    (a) => new Date(a.start_time) < now || a.status === 'CANCELLED'
  );

  const getDocName = (appt) => {
    const p = appt?.doctor_profiles?.profiles;
    return p ? `Dr. ${p.first_name} ${p.last_name}` : 'Specialist';
  };

  const next14Days = useMemo(() => {
    const list = [];
    const curr = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(curr);
      d.setDate(curr.getDate() + i);
      list.push({
        iso: d.toISOString().split('T')[0],
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
      });
    }
    return list;
  }, []);

  return (
    <div className="dashboard-layout">
      <Navbar />

      <main className="dashboard-main">
        {/* Welcome Hero Banner — Medical Teal */}
        <div className="dashboard-welcome-banner" style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 60%, #115e59 100%)' }}>
          <div>
            <h1>Welcome, {profile?.first_name || 'Patient'}!</h1>
            <p>Schedule consultations, manage upcoming visits, and access your digital E-Prescriptions.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '0.4rem 0.9rem',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              Patient Portal
            </span>

            <button
              onClick={() => {
                setActiveTab('doctors');
                if (doctors.length > 0) startBooking(doctors[0]);
              }}
              style={{
                padding: '0.65rem 1.25rem',
                background: '#ffffff',
                color: '#0f766e',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.92rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'transform 0.15s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <SparklesIcon size={17} />
              Book Appointment
            </button>
          </div>
        </div>

        {/* Patient Quick Summary Cards — Vibrant Accent Palette */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.15rem',
          }}
        >
          {/* Card 1: Upcoming Visits — Light Blue */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Upcoming Visits
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8' }}>
                SCHEDULED
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : upcomingAppts.length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {upcomingAppts.length === 1 ? 'consultation' : 'consultations'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#2563eb', fontWeight: 600, marginTop: '0.25rem' }}>
              {upcomingAppts.length > 0 ? `Next: ${formatDate(upcomingAppts[0].start_time)}` : 'No visits scheduled'}
            </div>
          </div>

          {/* Card 2: E-Prescriptions — Emerald Green */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                E-Prescriptions
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#ecfdf5', color: '#047857' }}>
                DIGITAL RX
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : prescriptions.length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>active orders</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600, marginTop: '0.25rem' }}>
              {prescriptions.length > 0 ? 'Digital orders ready for pharmacy' : 'No active prescriptions'}
            </div>
          </div>

          {/* Card 3: Care Records — Light Purple */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Care Records
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9' }}>
                FINALIZED
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : Object.keys(consultNotes).length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>clinical records</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.25rem' }}>
              Official physician summaries
            </div>
          </div>

          {/* Card 4: Available Doctors — Light Orange / Amber */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Available Doctors
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fffbeb', color: '#b45309' }}>
                ON DUTY
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : doctors.length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>specialists</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#d97706', fontWeight: 600, marginTop: '0.25rem' }}>
              Accepting appointments today
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border-card)',
            paddingBottom: '0.65rem',
          }}
        >
          <button
            onClick={() => setActiveTab('doctors')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'doctors' ? '#0d9488' : 'transparent',
              color: activeTab === 'doctors' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'doctors' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <StethoscopeIcon size={18} />
            Find Doctors & Book
          </button>

          <button
            onClick={() => setActiveTab('appointments')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'appointments' ? '#0d9488' : 'transparent',
              color: activeTab === 'appointments' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'appointments' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <CalendarIcon size={18} />
            My Appointments ({appointments.length})
          </button>

          <button
            onClick={() => setActiveTab('prescriptions')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'prescriptions' ? '#0d9488' : 'transparent',
              color: activeTab === 'prescriptions' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'prescriptions' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <FileTextIcon size={18} />
            E-Prescriptions ({prescriptions.length})
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'notes' ? '#0d9488' : 'transparent',
              color: activeTab === 'notes' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'notes' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <ActivityIcon size={18} />
            Care Plans ({Object.keys(consultNotes).length})
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'profile' ? '#0d9488' : 'transparent',
              color: activeTab === 'profile' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'profile' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <UserIcon size={18} />
            Patient Profile
          </button>
        </div>



        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: FIND DOCTORS & BOOK
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'doctors' && (
          <div>
            {/* Search & Filter Controls */}
            <div
              className="dashboard-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--slate-900)' }}>Medical Specialists</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>Select a doctor to book a consultation</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--slate-50)',
                    border: '1.5px solid var(--slate-200)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.9rem',
                    gap: '0.6rem',
                  }}
                >
                  <SearchIcon size={18} style={{ color: 'var(--slate-400)' }} />
                  <input
                    type="text"
                    placeholder="Search doctor by name, specialty, or license..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem' }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                      <XIcon size={16} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FilterIcon size={18} style={{ color: 'var(--slate-500)' }} />
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    style={{
                      padding: '0.65rem 1rem',
                      border: '1.5px solid var(--slate-300)',
                      borderRadius: '10px',
                      background: '#fff',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {SPECIALTIES.map((spec) => (
                      <option key={spec} value={spec}>{spec}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {doctorsLoading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--slate-500)' }}>
                <div className="spinner spinner-dark" style={{ width: '28px', height: '28px', margin: '0 auto 1rem' }}></div>
                <p>Loading medical providers...</p>
              </div>
            )}

            {!doctorsLoading && !doctorsError && filteredDoctors.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {filteredDoctors.map((doc, idx) => {
                  const docName = `Dr. ${doc.profiles?.first_name || 'Medical'} ${doc.profiles?.last_name || 'Provider'}`;
                  const initials = `${doc.profiles?.first_name?.[0] || 'D'}${doc.profiles?.last_name?.[0] || 'R'}`;

                  // Distinct accent palette per doctor card for enhanced visual hierarchy
                  const docPalettes = [
                    {
                      avatarBg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', // Teal Green
                      badgeBg: '#f0fdfa',
                      badgeColor: '#0f766e',
                      badgeBorder: '#ccfbf1',
                      durationColor: '#0d9488',
                    },
                    {
                      avatarBg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Light Blue
                      badgeBg: '#eff6ff',
                      badgeColor: '#1d4ed8',
                      badgeBorder: '#bfdbfe',
                      durationColor: '#2563eb',
                    },
                    {
                      avatarBg: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', // Light Purple
                      badgeBg: '#f5f3ff',
                      badgeColor: '#6d28d9',
                      badgeBorder: '#ddd6fe',
                      durationColor: '#7c3aed',
                    },
                    {
                      avatarBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Light Orange
                      badgeBg: '#fffbeb',
                      badgeColor: '#b45309',
                      badgeBorder: '#fde68a',
                      durationColor: '#d97706',
                    },
                  ];
                  const palette = docPalettes[idx % docPalettes.length];

                  return (
                    <div
                      key={doc.id}
                      className="dashboard-card"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '1.5rem',
                        border: '1.5px solid var(--slate-200)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <div
                            style={{
                              width: '52px',
                              height: '52px',
                              borderRadius: '16px',
                              background: palette.avatarBg,
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                              fontWeight: 800,
                              boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--slate-900)' }}>{docName}</h3>
                            <span style={{ display: 'inline-block', background: palette.badgeBg, color: palette.badgeColor, padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: `1px solid ${palette.badgeBorder}`, marginTop: '0.2rem' }}>
                              {doc.specialization}
                            </span>
                          </div>
                        </div>

                        <div style={{ background: 'var(--slate-50)', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ color: 'var(--slate-500)' }}>License:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{doc.license_number || 'Verified'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--slate-500)' }}>Slot Duration:</span>
                            <span style={{ fontWeight: 600, color: palette.durationColor }}>{doc.consultation_duration_minutes || 30} mins</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => startBooking(doc)}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          background: '#0d9488',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          marginTop: '1rem',
                          boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
                        }}
                      >
                        <CalendarIcon size={15} />
                        Check Availability & Book
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: MY APPOINTMENTS
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'appointments' && (
          <div>
            <div className="dashboard-card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--slate-900)' }}>My Consultations</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>Track upcoming visits and submit pre-visit clinical intakes.</p>
              </div>

              <button
                onClick={() => setActiveTab('doctors')}
                style={{
                  padding: '0.55rem 1.1rem',
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <CalendarIcon size={16} />
                Book New Appointment
              </button>
            </div>

            {apptLoading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--slate-500)' }}>
                <div className="spinner spinner-dark" style={{ width: '28px', height: '28px', margin: '0 auto 1rem' }}></div>
                <p>Loading your appointments...</p>
              </div>
            )}

            {!apptLoading && appointments.length === 0 && (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <CalendarIcon size={40} style={{ color: 'var(--slate-400)', margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--slate-800)', marginBottom: '0.5rem' }}>No scheduled visits</h3>
                <p style={{ fontSize: '0.85rem' }}>You have not booked any consultations yet.</p>
              </div>
            )}

            {!apptLoading && appointments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {upcomingAppts.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--slate-600)', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircleIcon size={16} style={{ color: '#16a34a' }} />
                      Upcoming Visits ({upcomingAppts.length})
                    </h3>

                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                      {upcomingAppts.map((appt) => {
                        const hasIntake = !!intakes[appt.id];

                        return (
                          <div
                            key={appt.id}
                            className="dashboard-card"
                            style={{
                              padding: '1.25rem 1.4rem',
                              borderLeft: '4px solid var(--teal-700)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.85rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                <div
                                  style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '10px',
                                    background: 'var(--teal-50)',
                                    color: 'var(--teal-700)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    border: '1px solid var(--teal-100)',
                                  }}
                                >
                                  <StethoscopeIcon size={22} />
                                </div>
                                <div>
                                  <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    {getDocName(appt)}
                                  </h4>
                                  <div style={{ fontSize: '0.88rem', color: 'var(--teal-700)', fontWeight: 700 }}>
                                    {appt.doctor_profiles?.specialization || 'Clinical Specialist'}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    <span>{formatDate(appt.start_time)}</span>
                                    <span>•</span>
                                    <span>{formatTime(appt.start_time)} – {formatTime(appt.end_time)}</span>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <StatusBadge status={appt.status} />

                                <button
                                  onClick={() => handleCancel(appt.id)}
                                  disabled={cancellingId === appt.id}
                                  className="btn btn-danger-outline"
                                  style={{
                                    padding: '0.45rem 0.9rem',
                                    fontSize: '0.88rem',
                                    minHeight: '38px',
                                  }}
                                >
                                  Cancel Visit
                                </button>
                              </div>
                            </div>

                            {/* Pre-Visit Intake Banner */}
                            <div
                              style={{
                                background: hasIntake ? 'var(--teal-50)' : 'var(--amber-pending-bg)',
                                border: `1.5px solid ${hasIntake ? 'var(--teal-100)' : 'var(--amber-pending-border)'}`,
                                borderRadius: '8px',
                                padding: '0.75rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '0.75rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <FileTextIcon size={18} style={{ color: hasIntake ? 'var(--teal-700)' : 'var(--amber-pending)' }} />
                                <div>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: hasIntake ? 'var(--teal-900)' : '#92400e' }}>
                                    {hasIntake ? 'Pre-Visit Intake Submitted ✓' : 'Pre-Visit Intake Pending'}
                                  </span>
                                  <p style={{ fontSize: '0.82rem', color: hasIntake ? 'var(--teal-800)' : '#78350f', margin: 0 }}>
                                    {hasIntake
                                      ? `Chief Complaint: "${intakes[appt.id]?.chief_complaint}" (${intakes[appt.id]?.severity})`
                                      : 'Help your doctor prepare by sharing symptoms and medications before the visit.'}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => openIntakeModal(appt)}
                                className={hasIntake ? 'btn btn-secondary' : 'btn btn-primary'}
                                style={{
                                  padding: '0.45rem 1rem',
                                  fontSize: '0.88rem',
                                  minHeight: '38px',
                                }}
                              >
                                {hasIntake ? <EditIcon size={15} /> : <PlusIcon size={15} />}
                                {hasIntake ? 'Edit Intake' : 'Complete Intake'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {pastAppts.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--slate-500)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                      Past & Completed Consultations ({pastAppts.length})
                    </h3>

                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {pastAppts.map((appt) => {
                        const note = consultNotes[appt.id];

                        return (
                          <div
                            key={appt.id}
                            className="dashboard-card"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '1rem 1.25rem',
                              background: '#f8fafc',
                              flexWrap: 'wrap',
                              gap: '1rem',
                            }}
                          >
                            <div>
                              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{getDocName(appt)}</h4>
                              <div style={{ fontSize: '0.78rem', color: 'var(--slate-500)' }}>
                                {formatDate(appt.start_time)} • {formatTime(appt.start_time)}
                              </div>
                              {note && (
                                <div style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600, marginTop: '0.2rem' }}>
                                  Diagnosis: {note.diagnosis}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <StatusBadge status={appt.status} />

                              {note && (
                                <button
                                  onClick={() => handleOpenCareSummary(appt, note)}
                                  style={{
                                    padding: '0.45rem 0.9rem',
                                    background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    boxShadow: '0 2px 4px rgba(13, 148, 136, 0.2)',
                                  }}
                                >
                                  <SparklesIcon size={14} />
                                  AI Care Summary
                                </button>
                              )}

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: E-PRESCRIPTIONS & MEDICATION SCHEDULE
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'prescriptions' && (
          <div>
            {/* ── MEDICATION REMINDERS SCHEDULE SECTION ── */}
            <div className="dashboard-card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #0d9488' }}>
              <div className="card-header-with-icon" style={{ marginBottom: '1.15rem' }}>
                <div className="card-icon-wrapper teal" style={{ background: '#ccfbf1', color: '#0d9488' }}>
                  <BellIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    Daily Medication Schedule & Reminders
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>
                    Your automated medication reminder timeline and daily doses for today
                  </p>
                </div>
              </div>

              {dailyMedicationSchedule.length === 0 ? (
                <div style={{ background: '#f8fafc', padding: '2.5rem 1.5rem', borderRadius: '12px', textAlign: 'center', color: 'var(--slate-500)', border: '1px dashed #cbd5e1' }}>
                  <BellIcon size={32} style={{ color: '#94a3b8', margin: '0 auto 0.6rem', display: 'block' }} />
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155', margin: '0 0 0.35rem' }}>No medication reminders scheduled</h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, maxWidth: '500px', marginInline: 'auto' }}>
                    Your reminders will appear here automatically when your doctor finalizes an active prescription.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                  {dailyMedicationSchedule.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #ccfbf1',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        boxShadow: '0 2px 4px rgba(13, 148, 136, 0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            background: '#0d9488',
                            color: '#ffffff',
                            padding: '0.25rem 0.7rem',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          ⏰ {item.timeFormatted} <span style={{ opacity: 0.85, fontWeight: 600 }}>• {item.period}</span>
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            border: '1px solid #86efac',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {item.status || 'UPCOMING'}
                        </span>
                      </div>

                      <div>
                        <div style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0f766e' }}>
                          {item.medication_name} {item.strength ? `• ${item.strength}` : ''}
                        </div>
                        <div style={{ fontSize: '0.86rem', color: '#334155', marginTop: '0.15rem', fontWeight: 600 }}>
                          {item.dosage} • {item.route || 'Oral (PO)'}
                        </div>
                      </div>

                      {item.instructions && (
                        <div style={{ fontSize: '0.82rem', color: '#0f766e', background: '#f0fdfa', padding: '0.4rem 0.75rem', borderRadius: '6px', borderLeft: '3px solid #0d9488' }}>
                          <strong>Instructions:</strong> {item.instructions}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--slate-500)', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                        <span>Frequency: <strong>{item.frequency}</strong></span>
                        <span style={{ fontWeight: 700, color: '#0f766e' }}>
                          {item.treatmentText} {item.remainingDaysText ? `(${item.remainingDaysText})` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── OFFICIAL E-PRESCRIPTIONS LIST ── */}
            <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header-with-icon">
                <div className="card-icon-wrapper purple" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                  <FileTextIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Official Medical Prescriptions</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                    Doctor-prescribed medications, dosages, clinical advice, and printable PDF documents
                  </p>
                </div>
              </div>
            </div>

            {prescriptions.length === 0 ? (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <FileTextIcon size={36} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--slate-800)' }}>No prescriptions issued yet</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  When your physician writes an electronic prescription during your consultation, it will appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                {prescriptions.map((rx) => {
                  const docProf = rx.doctor_profiles?.profiles;
                  const docName = docProf ? `Dr. ${docProf.first_name} ${docProf.last_name}` : 'Physician';

                  return (
                    <div
                      key={rx.id}
                      className="dashboard-card"
                      style={{
                        padding: '1.5rem',
                        borderLeft: '4px solid #7e22ce',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.75rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Digital Prescription (Rx)
                          </span>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                            {docName}
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                            Issued: {formatDate(rx.issued_at || rx.created_at)} • Specialty: {rx.doctor_profiles?.specialization || 'General Medicine'}
                          </span>
                          {rx.consultation_notes?.diagnosis && (
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f766e', marginTop: '0.2rem' }}>
                              Linked Diagnosis: {rx.consultation_notes.diagnosis}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              background: rx.status === 'FINALIZED' ? '#dcfce7' : '#fef9c3',
                              color: rx.status === 'FINALIZED' ? '#15803d' : '#854d0e',
                              border: `1px solid ${rx.status === 'FINALIZED' ? '#86efac' : '#fde047'}`,
                            }}
                          >
                            {rx.status === 'FINALIZED' ? 'Verified & Signed' : 'Draft Rx'}
                          </span>

                          <button
                            onClick={() => setViewingRx(rx)}
                            style={{
                              padding: '0.45rem 0.9rem',
                              background: '#7e22ce',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <FileTextIcon size={14} />
                            View & Print Rx
                          </button>
                        </div>
                      </div>

                      {/* Medication Items Grid */}
                      <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {(rx.prescription_items || []).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#faf5ff',
                              border: '1px solid #e9d5ff',
                              borderRadius: '8px',
                              padding: '0.75rem 1rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                            }}
                          >
                            <div>
                              <strong style={{ color: 'var(--slate-900)', fontSize: '0.95rem' }}>{item.medication_name}</strong>{' '}
                              {item.strength && <span style={{ color: '#7e22ce', fontWeight: 700 }}>({item.strength})</span>}
                              <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', marginTop: '0.2rem' }}>
                                Dosage: <strong>{item.dosage}</strong> • Frequency: <strong>{item.frequency}</strong> • Route: <strong>{item.route}</strong> • Duration: <strong>{item.duration}</strong>
                              </div>
                              {/* Generated Schedule Times Badge */}
                              <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Schedule:
                                </span>
                                {(item.frequency?.toLowerCase().includes('once') || item.frequency?.toLowerCase().includes('morning') || item.frequency?.toLowerCase().includes('daily') || item.frequency?.toLowerCase().includes('twice') || item.frequency?.toLowerCase().includes('three') || item.frequency?.toLowerCase().includes('four') || item.frequency?.toLowerCase().includes('8 hour') || item.frequency?.toLowerCase().includes('6 hour') || item.frequency?.toLowerCase().includes('bid') || item.frequency?.toLowerCase().includes('tid') || item.frequency?.toLowerCase().includes('qid')) && (
                                  <span style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ⏰ 08:00 AM (Morning)
                                  </span>
                                )}
                                {(item.frequency?.toLowerCase().includes('three') || item.frequency?.toLowerCase().includes('four') || item.frequency?.toLowerCase().includes('tid') || item.frequency?.toLowerCase().includes('qid') || item.frequency?.toLowerCase().includes('afternoon') || item.frequency?.toLowerCase().includes('8 hour') || item.frequency?.toLowerCase().includes('6 hour')) && (
                                  <span style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ⏰ 02:00 PM (Afternoon)
                                  </span>
                                )}
                                {(item.frequency?.toLowerCase().includes('twice') || item.frequency?.toLowerCase().includes('three') || item.frequency?.toLowerCase().includes('four') || item.frequency?.toLowerCase().includes('night') || item.frequency?.toLowerCase().includes('evening') || item.frequency?.toLowerCase().includes('bedtime') || item.frequency?.toLowerCase().includes('bid') || item.frequency?.toLowerCase().includes('tid') || item.frequency?.toLowerCase().includes('qid') || item.frequency?.toLowerCase().includes('8 hour') || item.frequency?.toLowerCase().includes('6 hour')) && (
                                  <span style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ⏰ 08:00 PM (Evening/Night)
                                  </span>
                                )}
                                {(item.frequency?.toLowerCase().includes('four') || item.frequency?.toLowerCase().includes('qid') || item.frequency?.toLowerCase().includes('6 hour')) && (
                                  <span style={{ fontSize: '0.72rem', background: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ⏰ 10:00 PM (Bedtime)
                                  </span>
                                )}
                              </div>
                            </div>

                            {item.instructions && (
                              <span style={{ fontSize: '0.8rem', color: '#581c87', background: '#f3e8ff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                                {item.instructions}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {rx.notes && (
                        <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--slate-600)', background: '#f8fafc', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                          <strong>Doctor's Notes:</strong> {rx.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 4: CARE PLANS
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div>
            <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header-with-icon">
                <div className="card-icon-wrapper teal">
                  <FileTextIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem' }}>Consultation History & Care Plans</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                    Access official physician diagnoses, clinical notes, treatment plans, and follow-up instructions.
                  </p>
                </div>
              </div>
            </div>

            {Object.keys(consultNotes).length === 0 ? (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <FileTextIcon size={36} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--slate-800)' }}>No completed consultation records yet</h4>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                {Object.values(consultNotes).map((note) => {
                  const linkedAppt = appointments.find((a) => a.id === note.appointment_id);

                  return (
                    <div
                      key={note.id}
                      className="dashboard-card"
                      style={{
                        padding: '1.5rem',
                        borderLeft: '4px solid #0d9488',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.75rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Clinical Record
                          </span>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                            {linkedAppt ? getDocName(linkedAppt) : 'Healthcare Provider'}
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                            Consultation Date: {formatDate(linkedAppt?.start_time || note.created_at)}
                          </span>
                        </div>

                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                          Finalized Care Record
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                            Official Diagnosis
                          </span>
                          <p style={{ fontWeight: 800, color: 'var(--slate-900)', marginTop: '0.2rem', fontSize: '1rem' }}>
                            {note.diagnosis}
                          </p>
                        </div>

                        <div style={{ background: '#f0fdfa', padding: '1rem', borderRadius: '10px', border: '1px solid #ccfbf1' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' }}>
                            Treatment Plan & Prescription Summary
                          </span>
                          <p style={{ color: 'var(--slate-800)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                            {note.treatment_plan}
                          </p>
                        </div>
                      </div>

                      {note.examination_notes && (
                        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: 'var(--slate-700)' }}>Clinical Observations:</strong>
                          <p style={{ color: 'var(--slate-600)', marginTop: '0.2rem' }}>{note.examination_notes}</p>
                        </div>
                      )}

                      {note.follow_up_instructions && (
                        <div style={{ marginTop: '1rem', padding: '0.85rem', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#854d0e' }}>Follow-up Instructions:</strong>
                          <p style={{ color: '#a16207', margin: '0.2rem 0' }}>{note.follow_up_instructions}</p>
                          {note.follow_up_date && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#854d0e' }}>
                              Recommended Follow-up Date: {formatDate(note.follow_up_date)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 5: PROFILE OVERVIEW
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div className="dashboard-grid">
            {/* ── CARD 1: PATIENT PROFILE ── */}
            <div className="dashboard-card" style={{ padding: '1.5rem' }}>
              <div className="card-header-with-icon" style={{ marginBottom: '1.25rem' }}>
                <div className="card-icon-wrapper teal">
                  <UserIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>Patient Profile</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--slate-500)', marginTop: '0.15rem' }}>Account & contact details</p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.9rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--slate-200)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Full Name
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--slate-900)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {profile?.first_name || ''} {profile?.last_name || ''}
                  </span>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.9rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--slate-200)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Email
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: 'var(--slate-900)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {user?.email || 'N/A'}
                  </span>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.9rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--slate-200)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Phone
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--slate-900)',
                    }}
                  >
                    {profile?.phone_number || 'Not provided'}
                  </span>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.9rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--slate-200)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Patient ID
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--slate-700)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {user?.id ? `${user.id.substring(0, 13)}...` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── CARD 2: MEDICAL DOCUMENTATION SUMMARY ── */}
            <div className="dashboard-card" style={{ padding: '1.5rem' }}>
              <div className="card-header-with-icon" style={{ marginBottom: '1.25rem' }}>
                <div className="card-icon-wrapper blue">
                  <ActivityIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>Medical Documentation Summary</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--slate-500)', marginTop: '0.15rem' }}>Intakes, care plans & prescriptions</p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1px solid #ccfbf1',
                    borderRadius: '12px',
                    padding: '1.25rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#0f766e',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Pre-Visit Intakes
                  </span>
                  <span
                    style={{
                      fontSize: '2rem',
                      fontWeight: 800,
                      color: '#0d9488',
                      lineHeight: 1,
                      marginBottom: '0.45rem',
                    }}
                  >
                    {Object.keys(intakes).length}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#115e59',
                      background: '#ccfbf1',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Submitted
                  </span>
                </div>

                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #dcfce7',
                    borderRadius: '12px',
                    padding: '1.25rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#15803d',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Clinical Care Records
                  </span>
                  <span
                    style={{
                      fontSize: '2rem',
                      fontWeight: 800,
                      color: '#16a34a',
                      lineHeight: 1,
                      marginBottom: '0.45rem',
                    }}
                  >
                    {Object.keys(consultNotes).length}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#166534',
                      background: '#dcfce7',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Finalized
                  </span>
                </div>

                <div
                  style={{
                    background: '#faf5ff',
                    border: '1px solid #f3e8ff',
                    borderRadius: '12px',
                    padding: '1.25rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#7e22ce',
                      marginBottom: '0.5rem',
                    }}
                  >
                    E-Prescriptions
                  </span>
                  <span
                    style={{
                      fontSize: '2rem',
                      fontWeight: 800,
                      color: '#9333ea',
                      lineHeight: 1,
                      marginBottom: '0.45rem',
                    }}
                  >
                    {prescriptions.length}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#6b21a8',
                      background: '#f3e8ff',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Issued
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW / PRINT E-PRESCRIPTION MODAL (Patient & Doctor)
         ══════════════════════════════════════════════════════════════════════════ */}
      {viewingRx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingRx(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header / Print Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--slate-200)',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#7e22ce', fontFamily: 'serif' }}>℞</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Electronic Medical Prescription
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: '0.45rem 0.9rem',
                    background: '#0d9488',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Print / Download PDF
                </button>

                <button
                  onClick={() => setViewingRx(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
                >
                  <XIcon size={20} />
                </button>
              </div>
            </div>

            {/* Printable Prescription Body */}
            <div style={{ padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {/* Doctor / Clinic Banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0d9488', paddingBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f766e', margin: 0 }}>
                    MedSync Health Clinic
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', margin: '0.2rem 0 0' }}>
                    Physician: Dr. {viewingRx.doctor_profiles?.profiles?.first_name} {viewingRx.doctor_profiles?.profiles?.last_name}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', margin: '0.1rem 0 0' }}>
                    Specialty: {viewingRx.doctor_profiles?.specialization || 'General Medicine'} • License: {viewingRx.doctor_profiles?.license_number || 'Verified'}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Rx Identifier
                  </span>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: 'var(--slate-800)' }}>
                    {viewingRx.id.substring(0, 13)}...
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '0.2rem' }}>
                    Date: {formatDate(viewingRx.issued_at || viewingRx.created_at)}
                  </div>
                </div>
              </div>

              {/* Patient Info */}
              <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: 'var(--slate-500)' }}>Patient:</span>{' '}
                  <strong style={{ color: 'var(--slate-900)' }}>{profile?.first_name} {profile?.last_name}</strong>
                </div>
                {viewingRx.consultation_notes?.diagnosis && (
                  <div>
                    <span style={{ color: 'var(--slate-500)' }}>Diagnosis:</span>{' '}
                    <strong style={{ color: '#0d9488' }}>{viewingRx.consultation_notes.diagnosis}</strong>
                  </div>
                )}
              </div>

              {/* Rx Symbol & Medication Table */}
              <div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#7e22ce', fontFamily: 'serif', marginBottom: '0.5rem' }}>
                  ℞
                </div>

                <div style={{ border: '1px solid var(--slate-200)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--slate-200)' }}>
                        <th style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>Medication & Strength</th>
                        <th style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>Dosage / Frequency</th>
                        <th style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>Duration</th>
                        <th style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingRx.prescription_items || []).map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                          <td style={{ padding: '0.75rem 0.8rem', color: 'var(--slate-400)', fontWeight: 700 }}>{idx + 1}</td>
                          <td style={{ padding: '0.75rem 0.8rem' }}>
                            <strong style={{ color: 'var(--slate-900)' }}>{item.medication_name}</strong>{' '}
                            {item.strength && <span style={{ color: '#7e22ce' }}>({item.strength})</span>}
                          </td>
                          <td style={{ padding: '0.75rem 0.8rem' }}>
                            {item.dosage} • {item.frequency} ({item.route})
                          </td>
                          <td style={{ padding: '0.75rem 0.8rem', fontWeight: 600 }}>{item.duration}</td>
                          <td style={{ padding: '0.75rem 0.8rem', color: 'var(--slate-600)' }}>
                            {item.instructions || 'As directed'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {viewingRx.notes && (
                <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '0.85rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#854d0e' }}>Doctor's Advice:</strong>
                  <p style={{ color: '#a16207', margin: '0.2rem 0 0' }}>{viewingRx.notes}</p>
                </div>
              )}

              {/* Signature Block */}
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center', width: '220px' }}>
                  <div style={{ fontFamily: 'cursive', fontSize: '1.2rem', color: '#0f766e', borderBottom: '1.5px solid var(--slate-400)', paddingBottom: '0.3rem' }}>
                    Dr. {viewingRx.doctor_profiles?.profiles?.first_name} {viewingRx.doctor_profiles?.profiles?.last_name}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Authorized Digital Signature
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW CARE SUMMARY MODAL (Patient side) */}
      {viewingConsultNote && viewingConsultAppt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingConsultNote(null);
              setViewingConsultAppt(null);
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--slate-200)',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Clinical Care Record & Summary
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
                  Physician: {getDocName(viewingConsultAppt)} • {formatDate(viewingConsultAppt.start_time)}
                </p>
              </div>
              <button
                onClick={() => {
                  setViewingConsultNote(null);
                  setViewingConsultAppt(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                  Official Diagnosis
                </span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)', marginTop: '0.2rem' }}>
                  {viewingConsultNote.diagnosis}
                </p>
              </div>

              <div style={{ background: '#f0fdfa', padding: '1.1rem', borderRadius: '10px', border: '1px solid #ccfbf1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase' }}>
                  Treatment Plan & Prescription
                </span>
                <p style={{ color: 'var(--slate-800)', marginTop: '0.3rem', lineHeight: 1.5 }}>
                  {viewingConsultNote.treatment_plan}
                </p>
              </div>

              {viewingConsultNote.examination_notes && (
                <div>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--slate-700)' }}>Clinical Observations:</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginTop: '0.2rem' }}>
                    {viewingConsultNote.examination_notes}
                  </p>
                </div>
              )}

              {viewingConsultNote.follow_up_instructions && (
                <div style={{ padding: '0.85rem', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#854d0e' }}>Follow-up Advice:</strong>
                  <p style={{ fontSize: '0.85rem', color: '#a16207', margin: '0.2rem 0' }}>
                    {viewingConsultNote.follow_up_instructions}
                  </p>
                  {viewingConsultNote.follow_up_date && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#854d0e' }}>
                      Recommended Follow-up: {formatDate(viewingConsultNote.follow_up_date)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRE-VISIT SYMPTOM INTAKE MODAL */}
      {intakeModalOpen && activeApptForIntake && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIntakeModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--slate-200)',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Pre-Visit Symptom Intake
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600 }}>
                  For Consultation with {getDocName(activeApptForIntake)} • {formatDate(activeApptForIntake.start_time)}
                </p>
              </div>

              <button onClick={() => setIntakeModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveIntake} style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {intakeError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {intakeError}
                </div>
              )}

              {intakeSuccessNotice && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', color: '#0f766e', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 700 }}>
                  {intakeSuccessNotice}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Main Reason for Consultation / Chief Complaint *</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Recurring migraine, lower back pain, persistent cough..."
                  value={intakeForm.chief_complaint}
                  onChange={(e) => setIntakeForm({ ...intakeForm, chief_complaint: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Describe Your Symptoms *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe what you are experiencing, frequency, triggers..."
                  value={intakeForm.symptoms}
                  onChange={(e) => setIntakeForm({ ...intakeForm, symptoms: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>When Did These Symptoms Start?</label>
                <input
                  type="text"
                  placeholder="E.g. 3 days ago, about 2 weeks ago, since yesterday morning..."
                  value={intakeForm.symptom_onset}
                  onChange={(e) => setIntakeForm({ ...intakeForm, symptom_onset: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={formLabelStyle}>Severity Level</label>
                  <select
                    value={intakeForm.severity}
                    onChange={(e) => setIntakeForm({ ...intakeForm, severity: e.target.value })}
                    style={formInputStyle}
                  >
                    {SEVERITY_LEVELS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={formLabelStyle}>Progression</label>
                  <select
                    value={intakeForm.progression}
                    onChange={(e) => setIntakeForm({ ...intakeForm, progression: e.target.value })}
                    style={formInputStyle}
                  >
                    {PROGRESSION_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Current Medications (or 'None')</label>
                <input
                  type="text"
                  placeholder="E.g. Metformin 500mg, Lisinopril 10mg, Aspirin..."
                  value={intakeForm.current_medications}
                  onChange={(e) => setIntakeForm({ ...intakeForm, current_medications: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Known Allergies (or 'No known allergies')</label>
                <input
                  type="text"
                  placeholder="E.g. Penicillin, Sulfa drugs, Peanuts..."
                  value={intakeForm.allergies}
                  onChange={(e) => setIntakeForm({ ...intakeForm, allergies: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Existing Medical Conditions</label>
                <input
                  type="text"
                  placeholder="E.g. Hypertension, Type 2 Diabetes, Asthma..."
                  value={intakeForm.existing_conditions}
                  onChange={(e) => setIntakeForm({ ...intakeForm, existing_conditions: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={formLabelStyle}>Additional Notes for Your Doctor</label>
                <textarea
                  rows={2}
                  placeholder="Any other relevant details or questions for your physician..."
                  value={intakeForm.additional_notes}
                  onChange={(e) => setIntakeForm({ ...intakeForm, additional_notes: e.target.value })}
                  style={formInputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="submit"
                  disabled={intakeSaving}
                  style={{
                    flex: 1,
                    padding: '0.85rem',
                    background: '#0d9488',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: intakeSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {intakeSaving ? 'Saving Intake Summary...' : 'Submit Pre-Visit Intake'}
                </button>

                <button
                  type="button"
                  onClick={() => setIntakeModalOpen(false)}
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: '#f1f5f9',
                    color: 'var(--slate-700)',
                    border: '1px solid var(--slate-300)',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOOKING SLOT MODAL */}
      {modalStep && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(6px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalStep(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--slate-200)',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  {modalStep === 'slots' && 'Select Consultation Slot'}
                  {modalStep === 'review' && 'Review & Confirm Reservation'}
                  {modalStep === 'success' && 'Appointment Confirmed!'}
                </h3>
                {selectedDoctor && (
                  <p style={{ fontSize: '0.8rem', color: '#0f766e', fontWeight: 600, marginTop: '0.2rem' }}>
                    Dr. {selectedDoctor.profiles?.first_name} {selectedDoctor.profiles?.last_name} • {selectedDoctor.specialization}
                  </p>
                )}
              </div>

              <button onClick={() => setModalStep(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '1.5rem', flex: 1 }}>
              {modalStep === 'slots' && (
                <div>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                        1. Select Appointment Date
                      </label>
                      <input
                        type="date"
                        min={todayISO()}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '0.3rem 0.6rem', border: '1px solid var(--slate-300)', borderRadius: '6px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                      {next14Days.map((d) => {
                        const isSelected = selectedDate === d.iso;
                        return (
                          <button
                            key={d.iso}
                            onClick={() => setSelectedDate(d.iso)}
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderRadius: '10px',
                              border: `1.5px solid ${isSelected ? '#0d9488' : 'var(--slate-200)'}`,
                              background: isSelected ? '#0d9488' : '#ffffff',
                              color: isSelected ? '#ffffff' : 'var(--slate-700)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              minWidth: '58px',
                            }}
                          >
                            <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{d.dayName}</span>
                            <span style={{ fontSize: '1rem', fontWeight: 800 }}>{d.dayNum}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--slate-700)', marginBottom: '0.75rem' }}>
                      2. Available Time Slots ({slots.length})
                    </label>

                    {slotsLoading && (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--slate-500)' }}>
                        <div className="spinner spinner-dark" style={{ width: '22px', height: '22px', margin: '0 auto 0.5rem' }}></div>
                        <p style={{ fontSize: '0.85rem' }}>Checking availability...</p>
                      </div>
                    )}

                    {slotsError && !slotsLoading && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '1rem', borderRadius: '10px', fontSize: '0.85rem' }}>
                        {slotsError}
                      </div>
                    )}

                    {!slotsLoading && !slotsError && slots.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
                        {slots.map((slot, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectSlot(slot)}
                            style={{
                              padding: '0.6rem 0.5rem',
                              border: '1.5px solid var(--slate-200)',
                              borderRadius: '8px',
                              background: '#f8fafc',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              color: 'var(--slate-700)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <ClockIcon size={12} />
                            {slot.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalStep === 'review' && selectedSlot && (
                <div>
                  <div
                    style={{
                      background: '#fefce8',
                      border: '1.5px solid #fef08a',
                      borderRadius: '12px',
                      padding: '1rem',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase' }}>
                        Temporary Hold Active
                      </span>
                      <p style={{ fontSize: '0.82rem', color: '#a16207' }}>
                        Slot reserved while you confirm.
                      </p>
                    </div>
                    <div
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '8px',
                        background: '#fef08a',
                        color: '#854d0e',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                      }}
                    >
                      {Math.floor(holdSecondsLeft / 60)}:{String(holdSecondsLeft % 60).padStart(2, '0')}
                    </div>
                  </div>

                  <div style={{ background: '#f0fdfa', border: '1.5px solid #ccfbf1', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--slate-600)' }}>Physician:</span>
                      <span style={{ fontWeight: 800 }}>Dr. {selectedDoctor?.profiles?.first_name} {selectedDoctor?.profiles?.last_name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--slate-600)' }}>Date:</span>
                      <span style={{ fontWeight: 700 }}>{formatDate(selectedSlot.start.toISOString())}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--slate-600)' }}>Time:</span>
                      <span style={{ fontWeight: 700, color: '#0d9488' }}>
                        {formatTime(selectedSlot.start.toISOString())} – {formatTime(selectedSlot.end.toISOString())}
                      </span>
                    </div>
                  </div>

                  {bookingError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.85rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {bookingError}
                    </div>
                  )}

                  <button
                    onClick={handleConfirmBooking}
                    disabled={bookingInProgress}
                    style={{
                      width: '100%',
                      padding: '0.9rem',
                      background: bookingInProgress ? '#94a3b8' : '#0d9488',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: bookingInProgress ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {bookingInProgress ? 'Confirming Appointment...' : 'Confirm Appointment'}
                  </button>
                </div>
              )}

              {modalStep === 'success' && confirmedAppt && (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <CheckCircleIcon size={36} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '0.4rem' }}>
                    Appointment Scheduled!
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginBottom: '1.5rem' }}>
                    Your visit has been recorded in MedSync.
                  </p>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={() => {
                        setModalStep(null);
                        setActiveTab('appointments');
                        openIntakeModal(confirmedAppt);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.85rem',
                        background: '#0d9488',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <FileTextIcon size={16} />
                      Complete Pre-Visit Intake Now
                    </button>
                    <button
                      onClick={() => {
                        setModalStep(null);
                        setActiveTab('appointments');
                      }}
                      style={{
                        padding: '0.85rem 1.25rem',
                        background: '#f1f5f9',
                        color: 'var(--slate-700)',
                        border: '1px solid var(--slate-300)',
                        borderRadius: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Later
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI POST-VISIT PATIENT-FRIENDLY SUMMARY MODAL */}
      {viewingConsultNote && viewingConsultAppt && (
        <div

          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(6px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingConsultNote(null);
              setViewingConsultAppt(null);
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25)',
              width: '100%',
              maxWidth: '780px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--slate-200)',
                background: 'linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <SparklesIcon size={20} style={{ color: '#0d9488' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    Your Post-Visit Care Plan & Summary
                  </h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#0f766e', fontWeight: 600, marginTop: '0.2rem' }}>
                  {getDocName(viewingConsultAppt)} • {viewingConsultAppt.doctor_profiles?.specialization || 'Clinical Specialist'} • {formatDate(viewingConsultAppt.start_time)}
                </p>
              </div>

              <button
                onClick={() => {
                  setViewingConsultNote(null);
                  setViewingConsultAppt(null);
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
              {aiPostSummaryLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#0d9488' }}>
                  <div className="spinner spinner-dark" style={{ width: '28px', height: '28px', margin: '0 auto 1rem' }}></div>
                  <p style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0 }}>
                    Preparing your personalized patient-friendly care summary...
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--slate-400)', marginTop: '0.3rem' }}>
                    Translating medical assessment and structuring your care plan
                  </p>
                </div>
              ) : (
                <>
                  {aiPostSummaryError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.82rem' }}>
                      {aiPostSummaryError}
                    </div>
                  )}

                  {aiPostSummary && (
                    <>
                      {/* Section 1: What the Doctor Noted */}
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '1.25rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <FileTextIcon size={15} />
                          What the Doctor Noted
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--slate-800)', lineHeight: 1.55, margin: 0 }}>
                          {aiPostSummary.summary}
                        </p>
                      </div>

                      {/* Section 2: Understanding Your Condition */}
                      <div
                        style={{
                          background: '#f0fdfa',
                          border: '1.5px solid #ccfbf1',
                          borderRadius: '14px',
                          padding: '1.25rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                          Understanding Your Condition
                        </div>
                        <p style={{ fontSize: '0.88rem', color: '#134e4a', lineHeight: 1.55, margin: 0 }}>
                          {aiPostSummary.diagnosis_explanation}
                        </p>
                      </div>

                      {/* Section 3: Medication Schedule */}
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '1.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Your Prescribed Medicines ({aiPostSummary.medications?.length || 0})
                          </span>
                        </div>

                        {(!aiPostSummary.medications || aiPostSummary.medications.length === 0) ? (
                          <p style={{ fontSize: '0.82rem', color: 'var(--slate-400)', fontStyle: 'italic', margin: 0 }}>
                            No medications were prescribed for this consultation.
                          </p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Medicine</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Dosage</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Frequency</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Duration</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Instructions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiPostSummary.medications.map((med, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem', fontWeight: 800, color: '#0f172a' }}>
                                      {med.name} {med.strength && <span style={{ fontWeight: 400, color: '#64748b' }}>({med.strength})</span>}
                                    </td>
                                    <td style={{ padding: '0.6rem' }}>{med.dosage}</td>
                                    <td style={{ padding: '0.6rem', color: '#0d9488', fontWeight: 700 }}>{med.frequency}</td>
                                    <td style={{ padding: '0.6rem' }}>{med.duration}</td>
                                    <td style={{ padding: '0.6rem', color: '#475569' }}>{med.instructions || 'As advised'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Section 4: Follow-up Guidance */}
                      <div
                        style={{
                          background: '#faf5ff',
                          border: '1.5px solid #f3e8ff',
                          borderRadius: '14px',
                          padding: '1.25rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Recommended Follow-up</span>
                          {aiPostSummary.follow_up?.date && (
                            <span style={{ background: '#7e22ce', color: '#fff', fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                              Date: {aiPostSummary.follow_up.date}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#581c87', margin: 0, lineHeight: 1.5 }}>
                          {aiPostSummary.follow_up?.instructions || 'Follow up as needed if symptoms persist.'}
                        </p>
                      </div>

                      {/* Disclaimer */}
                      <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>
                        ⚖️ <strong>Notice:</strong> AI-generated patient-friendly summary based on your doctor's finalized consultation. It does not replace your doctor's medical advice.
                      </p>
                    </>
                  )}

                  {/* Toggle Raw Doctor Notes */}
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowRawDoctorNotes(!showRawDoctorNotes)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0d9488',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <FileTextIcon size={14} />
                      {showRawDoctorNotes ? 'Hide Official Clinical Notes' : 'View Official Clinical Notes recorded by Physician'}
                    </button>

                    {showRawDoctorNotes && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginTop: '0.6rem', fontSize: '0.82rem' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ color: '#334155' }}>Physician Diagnosis:</strong> {viewingConsultNote.diagnosis}
                        </div>
                        {viewingConsultNote.doctor_notes && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#334155' }}>Clinical Notes:</strong> {viewingConsultNote.doctor_notes}
                          </div>
                        )}
                        {viewingConsultNote.treatment_plan && (
                          <div>
                            <strong style={{ color: '#334155' }}>Treatment Plan:</strong> {viewingConsultNote.treatment_plan}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--slate-200)',
                background: '#f8fafc',
              }}
            >
              <button
                type="button"
                onClick={() => fetchOrGenerateAiPostSummary(viewingConsultAppt.id, viewingConsultNote, true)}
                disabled={aiPostSummaryLoading}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid var(--slate-300)',
                  borderRadius: '8px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--slate-700)',
                  cursor: aiPostSummaryLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <SparklesIcon size={14} />
                Re-generate Care Summary
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewingConsultNote(null);
                  setViewingConsultAppt(null);
                }}
                style={{
                  background: '#0d9488',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 1.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

