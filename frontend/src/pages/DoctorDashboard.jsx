import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  CalendarIcon,
  BadgeCheckIcon,
  ActivityIcon,
  ClockIcon,
  UserIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  PlusIcon,
  TrashIcon,
  FilterIcon,
  SearchIcon,
  XIcon,
  PhoneIcon,
  StethoscopeIcon,
  FileTextIcon,
  EditIcon,
  SparklesIcon,
} from '../components/Icons';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/config';
import { CalendarConnectButton } from '../components/CalendarConnectButton';



// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { day: 0, name: 'Sunday', short: 'Sun' },
  { day: 1, name: 'Monday', short: 'Mon' },
  { day: 2, name: 'Tuesday', short: 'Tue' },
  { day: 3, name: 'Wednesday', short: 'Wed' },
  { day: 4, name: 'Thursday', short: 'Thu' },
  { day: 5, name: 'Friday', short: 'Fri' },
  { day: 6, name: 'Saturday', short: 'Sat' },
];

const FREQUENCY_OPTIONS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'Before meals',
  'After meals',
  'At bedtime',
  'As needed (PRN)',
];

const ROUTE_OPTIONS = [
  'Oral (PO)',
  'Topical',
  'Sublingual',
  'Inhalation',
  'Ophthalmic (Eye drops)',
  'Otic (Ear drops)',
  'Intramuscular (IM)',
  'Intravenous (IV)',
  'Subcutaneous (SC)',
];

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

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ─── Status Badge Component ───────────────────────────────────────────────────

const STATUS_CONFIG = {
  HELD:      { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'HELD' },
  CONFIRMED: { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'CONFIRMED' },
  COMPLETED: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'COMPLETED' },
  CANCELLED: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'CANCELLED' },
  NO_SHOW:   { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: 'NO SHOW' },
};

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



const SEVERITY_COLORS = {
  MILD: { bg: '#dcfce7', text: '#15803d' },
  MODERATE: { bg: '#fef9c3', text: '#854d0e' },
  SEVERE: { bg: '#ffedd5', text: '#c2410c' },
  CRITICAL: { bg: '#fee2e2', text: '#b91c1c' },
};

export const DoctorDashboard = () => {
  const { user, profile } = useAuth();
  const doctorInfo = profile?.doctorProfile;

  // Active Tab: 'overview' | 'queue' | 'prescriptions' | 'hours' | 'leaves'
  const [activeTab, setActiveTab] = useState('overview');

  // Appointments, Intakes, Notes & Prescriptions State
  const [appointments, setAppointments] = useState([]);
  const [intakes, setIntakes] = useState({});
  const [consultNotes, setConsultNotes] = useState({});
  const [prescriptions, setPrescriptions] = useState({});
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState('');
  const [queueFilter, setQueueFilter] = useState('all');
  const [searchPatient, setSearchPatient] = useState('');

  // Selected Appointment Modal & Details
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [selectedApptIntake, setSelectedApptIntake] = useState(null);
  const [loadingApptIntake, setLoadingApptIntake] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusActionError, setStatusActionError] = useState('');

  // Active Consultation Workflow State
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [activeConsultAppt, setActiveConsultAppt] = useState(null);
  const [activeConsultIntake, setActiveConsultIntake] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState('');
  const [consultForm, setConsultForm] = useState({
    chief_complaint: '',
    examination_notes: '',
    diagnosis: '',
    treatment_plan: '',
    doctor_notes: '',
    follow_up_instructions: '',
    follow_up_date: '',
    is_finalized: false,
  });
  const [consultSaving, setConsultSaving] = useState(false);
  const [consultError, setConsultError] = useState('');
  const [consultSuccessNotice, setConsultSuccessNotice] = useState('');

  // Prescription Builder Modal State
  const [rxModalOpen, setRxModalOpen] = useState(false);

  const [rxAppt, setRxAppt] = useState(null);
  const [rxConsultationId, setRxConsultationId] = useState(null);
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxNotes, setRxNotes] = useState('');

  const [rxItems, setRxItems] = useState([
    { medication_name: '', strength: '', dosage: '1 tablet', frequency: 'Twice daily', route: 'Oral (PO)', duration: '7 days', quantity: '14 tablets', instructions: 'Take after meals' },
  ]);
  const [rxSaving, setRxSaving] = useState(false);
  const [rxError, setRxError] = useState('');
  const [rxSuccessNotice, setRxSuccessNotice] = useState('');

  // Working Hours State
  const [workingHours, setWorkingHours] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursNotice, setHoursNotice] = useState({ type: '', msg: '' });

  // Leaves State
  const [leaves, setLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [newLeaveStart, setNewLeaveStart] = useState('');
  const [newLeaveEnd, setNewLeaveEnd] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('');
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [deletingLeaveId, setDeletingLeaveId] = useState(null);

  // ── 1. Fetch Doctor Appointments, Intakes, Notes, & Prescriptions ──
  const fetchDoctorAppointmentsAndNotes = useCallback(async () => {
    if (!user?.id) return;
    setApptLoading(true);
    setApptError('');

    try {
      const { data, error } = await supabase
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
          patient_profiles (
            id,
            date_of_birth,
            gender,
            blood_group,
            emergency_contact_name,
            emergency_contact_phone,
            profiles (
              first_name,
              last_name,
              phone_number
            )
          )
        `)
        .eq('doctor_id', user.id)
        .order('start_time', { ascending: true });

      if (error) throw error;

      setAppointments(data || []);

      // Fetch linked intakes
      try {
        const { data: intakeData } = await supabase
          .from('appointment_intakes')
          .select('*')
          .eq('doctor_id', user.id);

        if (intakeData) {
          const map = {};
          intakeData.forEach((item) => {
            map[item.appointment_id] = item;
          });
          setIntakes(map);
        }
      } catch {
        // optional table
      }

      // Fetch linked consultation notes
      try {
        const { data: notesData } = await supabase
          .from('consultation_notes')
          .select('*')
          .eq('doctor_id', user.id);

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
            prescription_items (*)
          `)
          .eq('doctor_id', user.id);

        if (rxData) {
          const rxMap = {};
          rxData.forEach((rx) => {
            rxMap[rx.appointment_id] = rx;
          });
          setPrescriptions(rxMap);
        }
      } catch {
        // optional table
      }
    } catch (err) {
      console.error('Error fetching doctor appointments:', err);
      setApptError('Could not load appointments: ' + err.message);
    } finally {
      setApptLoading(false);
    }
  }, [user?.id]);

  // ── 2. Fetch Working Hours ──
  const fetchWorkingHours = useCallback(async () => {
    if (!user?.id) return;
    setHoursLoading(true);

    const { data, error } = await supabase
      .from('doctor_working_hours')
      .select('*')
      .eq('doctor_id', user.id)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.error('Error fetching working hours:', error);
    } else {
      const fullWeek = DAYS_OF_WEEK.map((d) => {
        const existing = (data || []).find((wh) => wh.day_of_week === d.day);
        return {
          id: existing?.id || null,
          day_of_week: d.day,
          day_name: d.name,
          start_time: existing?.start_time ? existing.start_time.substring(0, 5) : '09:00',
          end_time: existing?.end_time ? existing.end_time.substring(0, 5) : '17:00',
          is_active: existing ? existing.is_active : (d.day >= 1 && d.day <= 5),
        };
      });
      setWorkingHours(fullWeek);
    }
    setHoursLoading(false);
  }, [user?.id]);

  // ── 3. Fetch Leaves ──
  const fetchLeaves = useCallback(async () => {
    if (!user?.id) return;
    setLeavesLoading(true);

    const { data, error } = await supabase
      .from('doctor_leaves')
      .select('*')
      .eq('doctor_id', user.id)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching doctor leaves:', error);
    } else {
      setLeaves(data || []);
    }
    setLeavesLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchDoctorAppointmentsAndNotes();
    fetchWorkingHours();
    fetchLeaves();
  }, [fetchDoctorAppointmentsAndNotes, fetchWorkingHours, fetchLeaves]);

  // ── Load Intake when Opening Appointment Details Modal ──
  const handleOpenApptDetails = async (appt) => {
    setSelectedAppt(appt);
    setStatusActionError('');
    setLoadingApptIntake(true);
    setSelectedApptIntake(null);

    try {
      const { data, error } = await supabase
        .from('appointment_intakes')
        .select('*')
        .eq('appointment_id', appt.id)
        .maybeSingle();

      if (!error && data) {
        setSelectedApptIntake(data);
      }
    } catch (err) {
      console.error('Error fetching appointment intake:', err);
    } finally {
      setLoadingApptIntake(false);
    }
  };

  // ── Fetch or Generate AI Pre-Visit Summary ──
  const fetchOrGenerateAiSummary = async (apptId, intakeData, forceRegen = false) => {
    setAiSummaryLoading(true);
    setAiSummaryError('');
    try {
      if (!forceRegen) {
        const { data: dbSummary } = await supabase
          .from('ai_pre_visit_summaries')
          .select('*')
          .eq('appointment_id', apptId)
          .eq('status', 'COMPLETED')
          .maybeSingle();

        if (dbSummary) {
          setAiSummary(dbSummary);
          setAiSummaryLoading(false);
          return;
        }
      }

      const backendUrl = API_BASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      let apiSuccess = false;
      if (token) {
        try {
          const res = await fetch(`${backendUrl}/ai/pre-visit-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ appointment_id: apptId, force_regenerate: forceRegen }),
          });

          if (res.ok) {
            const resJson = await res.json();
            if (resJson.success && resJson.data) {
              setAiSummary(resJson.data);
              apiSuccess = true;
            }
          }
        } catch (e) {
          console.warn('Backend AI endpoint call skipped/failed, falling back:', e);
        }
      }

      if (!apiSuccess && intakeData) {
        const symptoms = (intakeData.symptoms || '').toLowerCase();
        const rawSev = (intakeData.severity || 'MODERATE').toUpperCase();
        let urgency = rawSev === 'CRITICAL' || rawSev === 'SEVERE' ? 'High' : rawSev === 'MILD' ? 'Low' : 'Medium';
        const chief = intakeData.chief_complaint || intakeData.symptoms || 'General Consultation';
        const fallbackSummary = {
          appointment_id: apptId,
          urgency,
          chief_complaint: chief,
          suggested_questions: [
            `When did the ${chief.toLowerCase()} first begin and how has it progressed over time?`,
            `Are the symptoms constant or intermittent, and what relieves or aggravates them?`,
            `Are there any associated symptoms like fever, shortness of breath, or dizziness?`,
          ],
          model_used: 'clinical-triage-v1',
        };
        setAiSummary(fallbackSummary);
      }
    } catch (err) {
      console.error('Error getting AI summary:', err);
      setAiSummaryError('Could not generate AI pre-visit summary.');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // ── Start / Open Consultation Workflow Screen ──
  const handleStartConsultation = async (appt) => {
    setActiveConsultAppt(appt);
    setConsultError('');
    setConsultSuccessNotice('');
    setAiSummary(null);
    setAiSummaryError('');

    let intakeData = intakes[appt.id] || null;
    if (!intakeData) {
      try {
        const { data } = await supabase
          .from('appointment_intakes')
          .select('*')
          .eq('appointment_id', appt.id)
          .maybeSingle();
        if (data) intakeData = data;
      } catch {
        // optional
      }
    }
    setActiveConsultIntake(intakeData);

    // Trigger AI pre-visit summary if intake exists
    if (intakeData) {
      fetchOrGenerateAiSummary(appt.id, intakeData, false);
    }

    const existingNote = consultNotes[appt.id];
    if (existingNote) {
      setConsultForm({
        chief_complaint: existingNote.chief_complaint || intakeData?.chief_complaint || '',
        examination_notes: existingNote.examination_notes || '',
        diagnosis: existingNote.diagnosis || '',
        treatment_plan: existingNote.treatment_plan || '',
        doctor_notes: existingNote.doctor_notes || '',
        follow_up_instructions: existingNote.follow_up_instructions || '',
        follow_up_date: existingNote.follow_up_date || '',
        is_finalized: existingNote.is_finalized || false,
      });
    } else {
      setConsultForm({
        chief_complaint: intakeData?.chief_complaint || '',
        examination_notes: '',
        diagnosis: '',
        treatment_plan: '',
        doctor_notes: '',
        follow_up_instructions: '',
        follow_up_date: '',
        is_finalized: false,
      });
    }

    setConsultModalOpen(true);
  };


  // ── Save / Finalize Consultation Notes ──
  const handleSaveConsultation = async (finalize = false) => {
    if (!activeConsultAppt || !user?.id) return;
    setConsultSaving(true);
    setConsultError('');
    setConsultSuccessNotice('');

    try {
      if (finalize) {
        if (!consultForm.diagnosis.trim()) {
          throw new Error('Please enter a clinical diagnosis to finalize this consultation.');
        }
        if (!consultForm.treatment_plan.trim()) {
          throw new Error('Please enter a treatment plan or assessment to finalize.');
        }
      }

      let rpcExecuted = false;

      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_consultation_atomic', {
          p_appointment_id: activeConsultAppt.id,
          p_diagnosis: consultForm.diagnosis.trim() || (finalize ? 'Clinical Evaluation' : 'Draft Assessment'),
          p_treatment_plan: consultForm.treatment_plan.trim() || (finalize ? 'Standard Care' : 'Draft Plan'),
          p_chief_complaint: consultForm.chief_complaint.trim() || null,
          p_examination_notes: consultForm.examination_notes.trim() || null,
          p_doctor_notes: consultForm.doctor_notes.trim() || null,
          p_follow_up_instructions: consultForm.follow_up_instructions.trim() || null,
          p_follow_up_date: consultForm.follow_up_date || null,
          p_is_finalized: finalize,
        });

        if (!rpcErr && rpcRes?.success) {
          rpcExecuted = true;
        }
      } catch {
        // Fallback
      }

      if (!rpcExecuted) {
        const payload = {
          appointment_id: activeConsultAppt.id,
          doctor_id: user.id,
          patient_id: activeConsultAppt.patient_id,
          chief_complaint: consultForm.chief_complaint.trim() || null,
          examination_notes: consultForm.examination_notes.trim() || null,
          diagnosis: consultForm.diagnosis.trim() || (finalize ? 'Clinical Evaluation' : 'Draft Assessment'),
          treatment_plan: consultForm.treatment_plan.trim() || (finalize ? 'Standard Care' : 'Draft Plan'),
          doctor_notes: consultForm.doctor_notes.trim() || null,
          follow_up_instructions: consultForm.follow_up_instructions.trim() || null,
          follow_up_date: consultForm.follow_up_date || null,
          is_finalized: finalize,
        };

        const existing = consultNotes[activeConsultAppt.id];
        let res;
        if (existing?.id) {
          res = await supabase
            .from('consultation_notes')
            .update(payload)
            .eq('id', existing.id);
        } else {
          res = await supabase
            .from('consultation_notes')
            .insert(payload);
        }

        if (res.error) throw res.error;

        if (finalize) {
          await supabase
            .from('appointments')
            .update({
              status: 'COMPLETED',
              hold_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', activeConsultAppt.id)
            .eq('doctor_id', user.id);
        }
      }

      if (finalize) {
        setConsultSuccessNotice('Consultation finalized & appointment marked COMPLETED!');
      } else {
        setConsultSuccessNotice('Consultation notes draft saved successfully.');
      }

      fetchDoctorAppointmentsAndNotes();

      setTimeout(() => {
        setConsultModalOpen(false);
      }, 1200);
    } catch (err) {
      console.error('Consultation save error:', err);
      setConsultError(err.message || 'Failed to save consultation notes.');
    } finally {
      setConsultSaving(false);
    }
  };

  // ── Open E-Prescription Builder Modal ──
  const handleOpenPrescriptionModal = (appt) => {
    setRxAppt(appt);
    setRxError('');
    setRxSuccessNotice('');

    const linkedNote = consultNotes[appt.id];
    setRxConsultationId(linkedNote?.id || null);
    setRxDiagnosis(linkedNote?.diagnosis || '');

    const existingRx = prescriptions[appt.id];

    if (existingRx) {
      setRxNotes(existingRx.notes || '');
      if (existingRx.prescription_items && existingRx.prescription_items.length > 0) {
        setRxItems(
          existingRx.prescription_items.map((item) => ({
            id: item.id,
            medication_name: item.medication_name,
            strength: item.strength || '',
            dosage: item.dosage || '1 tablet',
            frequency: item.frequency || 'Once daily',
            route: item.route || 'Oral (PO)',
            duration: item.duration || '7 days',
            quantity: item.quantity || '',
            instructions: item.instructions || '',
          }))
        );
      } else {
        setRxItems([
          { medication_name: '', strength: '', dosage: '1 tablet', frequency: 'Twice daily', route: 'Oral (PO)', duration: '7 days', quantity: '14 tablets', instructions: 'Take after meals' },
        ]);
      }
    } else {
      setRxNotes('');
      setRxItems([
        { medication_name: '', strength: '', dosage: '1 tablet', frequency: 'Twice daily', route: 'Oral (PO)', duration: '7 days', quantity: '14 tablets', instructions: 'Take after meals' },
      ]);
    }

    setRxModalOpen(true);
  };

  // ── Add / Remove Medicine Item in Rx Builder ──
  const handleAddMedicineRow = () => {
    setRxItems([
      ...rxItems,
      { medication_name: '', strength: '', dosage: '1 tablet', frequency: 'Twice daily', route: 'Oral (PO)', duration: '7 days', quantity: '', instructions: '' },
    ]);
  };

  const handleRemoveMedicineRow = (index) => {
    if (rxItems.length <= 1) {
      alert('Prescription must contain at least one medication item.');
      return;
    }
    const updated = rxItems.filter((_, idx) => idx !== index);
    setRxItems(updated);
  };

  const handleUpdateMedicineField = (index, field, value) => {
    const updated = [...rxItems];
    updated[index][field] = value;
    setRxItems(updated);
  };

  // ── Save / Finalize E-Prescription ──
  const handleSavePrescription = async (finalize = false) => {
    if (!rxAppt || !user?.id) return;
    setRxSaving(true);
    setRxError('');
    setRxSuccessNotice('');

    try {
      // 1. Ensure linked consultation note exists (create default note if not already created)
      let consultId = rxConsultationId || consultNotes[rxAppt.id]?.id;

      if (!consultId) {
        const { data: newNote, error: noteErr } = await supabase
          .from('consultation_notes')
          .insert({
            appointment_id: rxAppt.id,
            doctor_id: user.id,
            patient_id: rxAppt.patient_id,
            diagnosis: rxDiagnosis.trim() || null,
            treatment_plan: rxNotes.trim() || null,
            is_finalized: finalize,
          })
          .select('id')
          .single();

        if (noteErr) throw new Error('Could not link prescription with consultation: ' + noteErr.message);
        consultId = newNote.id;
        setRxConsultationId(consultId);
      } else if (rxDiagnosis.trim()) {
        await supabase
          .from('consultation_notes')
          .update({ diagnosis: rxDiagnosis.trim() })
          .eq('id', consultId);
      }


      // 2. Validate medication items
      const validItems = rxItems.filter((item) => item.medication_name.trim() !== '');
      if (validItems.length === 0) {
        throw new Error('Please enter at least one medication name.');
      }

      // 3. Try atomic RPC first
      let rpcExecuted = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_prescription_atomic', {
          p_appointment_id: rxAppt.id,
          p_consultation_id: consultId,
          p_notes: rxNotes.trim() || null,
          p_status: finalize ? 'FINALIZED' : 'DRAFT',
          p_items: validItems,
        });

        if (!rpcErr && rpcRes?.success) {
          rpcExecuted = true;
        }
      } catch {
        // fallback
      }

      // 4. Direct table fallback if RPC was not invoked
      if (!rpcExecuted) {
        const payload = {
          appointment_id: rxAppt.id,
          consultation_id: consultId,
          doctor_id: user.id,
          patient_id: rxAppt.patient_id,
          status: finalize ? 'FINALIZED' : 'DRAFT',
          notes: rxNotes.trim() || null,
          issued_at: finalize ? new Date().toISOString() : null,
        };

        const existingRx = prescriptions[rxAppt.id];
        let rxRecordId = existingRx?.id;

        if (rxRecordId) {
          const { error: upErr } = await supabase
            .from('prescriptions')
            .update(payload)
            .eq('id', rxRecordId);
          if (upErr) throw upErr;
        } else {
          const { data: newRx, error: inErr } = await supabase
            .from('prescriptions')
            .insert(payload)
            .select('id')
            .single();
          if (inErr) throw inErr;
          rxRecordId = newRx.id;
        }

        // Delete old items & insert new
        await supabase.from('prescription_items').delete().eq('prescription_id', rxRecordId);

        const itemsPayload = validItems.map((item) => ({
          prescription_id: rxRecordId,
          medication_name: item.medication_name.trim(),
          strength: item.strength.trim() || null,
          dosage: item.dosage.trim() || '1 dose',
          frequency: item.frequency,
          route: item.route,
          duration: item.duration.trim() || '7 days',
          quantity: item.quantity.trim() || null,
          instructions: item.instructions.trim() || null,
        }));

        const { error: itemsErr } = await supabase.from('prescription_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;

        if (finalize) {
          try {
            await supabase.rpc('generate_reminders_for_prescription', {
              p_prescription_id: rxRecordId,
            });
          } catch (genErr) {
            console.warn('Notice: Medication reminders RPC sync note:', genErr?.message);
          }
        }
      }

      setRxSuccessNotice(
        finalize
          ? 'E-Prescription successfully finalized & signed!'
          : 'Prescription draft saved successfully.'
      );

      fetchDoctorAppointmentsAndNotes();

      setTimeout(() => {
        setRxModalOpen(false);
      }, 1200);
    } catch (err) {
      console.error('Prescription save error:', err);
      setRxError(err.message || 'Failed to save prescription.');
    } finally {
      setRxSaving(false);
    }
  };

  // ── Save Working Hours ──
  const handleSaveWorkingHours = async () => {
    if (!user?.id) return;
    setHoursSaving(true);
    setHoursNotice({ type: '', msg: '' });

    try {
      for (const item of workingHours) {
        if (item.is_active && item.start_time >= item.end_time) {
          throw new Error(`Invalid hours for ${item.day_name}: End time must be later than Start time.`);
        }
      }

      const payload = workingHours.map((wh) => ({
        ...(wh.id ? { id: wh.id } : {}),
        doctor_id: user.id,
        day_of_week: wh.day_of_week,
        start_time: wh.start_time + ':00',
        end_time: wh.end_time + ':00',
        is_active: wh.is_active,
      }));

      const { error } = await supabase
        .from('doctor_working_hours')
        .upsert(payload, { onConflict: 'doctor_id, day_of_week' });

      if (error) throw error;

      setHoursNotice({ type: 'success', msg: 'Weekly working hours updated successfully.' });
      fetchWorkingHours();
    } catch (err) {
      console.error('Save hours error:', err);
      setHoursNotice({ type: 'error', msg: err.message || 'Failed to save working hours.' });
    } finally {
      setHoursSaving(false);
    }
  };

  // ── Add New Doctor Leave ──
  const handleAddLeave = async (e) => {
    e.preventDefault();
    if (!newLeaveStart || !newLeaveEnd || !user?.id) return;
    setLeaveSaving(true);
    setLeaveError('');

    try {
      const s = new Date(newLeaveStart);
      const end = new Date(newLeaveEnd);

      if (end <= s) {
        throw new Error('Leave end time must be strictly after the start time.');
      }

      const { error } = await supabase.from('doctor_leaves').insert({
        doctor_id: user.id,
        start_time: s.toISOString(),
        end_time: end.toISOString(),
        reason: newLeaveReason.trim() || 'Scheduled leave',
      });

      if (error) throw error;

      setLeaveModalOpen(false);
      setNewLeaveStart('');
      setNewLeaveEnd('');
      setNewLeaveReason('');
      fetchLeaves();
    } catch (err) {
      console.error('Add leave error:', err);
      setLeaveError(err.message || 'Failed to add leave.');
    } finally {
      setLeaveSaving(false);
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!window.confirm('Are you sure you want to remove this scheduled leave?')) return;
    setDeletingLeaveId(leaveId);

    const { error } = await supabase
      .from('doctor_leaves')
      .delete()
      .eq('id', leaveId)
      .eq('doctor_id', user.id);

    if (error) {
      alert('Failed to remove leave: ' + error.message);
    } else {
      fetchLeaves();
    }
    setDeletingLeaveId(null);
  };

  const handleUpdateApptStatus = async (apptId, nextStatus, extraReason = null) => {
    if (!apptId || !user?.id) return;
    setStatusUpdating(true);
    setStatusActionError('');

    try {
      const updates = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };

      if (nextStatus !== 'HELD') {
        updates.hold_expires_at = null;
      }

      if (extraReason) {
        updates.cancellation_reason = extraReason;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', apptId)
        .eq('doctor_id', user.id);

      if (error) throw error;

      fetchDoctorAppointmentsAndNotes();

      if (selectedAppt && selectedAppt.id === apptId) {
        setSelectedAppt((prev) => ({ ...prev, ...updates }));
      }
    } catch (err) {
      console.error('Update status error:', err);
      setStatusActionError(err.message || 'Failed to update appointment status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const now = new Date();

  const filteredQueue = useMemo(() => {
    return appointments.filter((a) => {
      const apptDate = new Date(a.start_time);
      if (queueFilter === 'today' && !isToday(a.start_time)) return false;
      if (queueFilter === 'upcoming' && (apptDate < now || a.status === 'CANCELLED' || a.status === 'COMPLETED')) return false;
      if (queueFilter === 'completed' && a.status !== 'COMPLETED') return false;
      if (queueFilter === 'cancelled' && a.status !== 'CANCELLED') return false;
      if (queueFilter === 'noshow' && a.status !== 'NO_SHOW') return false;

      if (searchPatient.trim()) {
        const query = searchPatient.toLowerCase();
        const pProf = a.patient_profiles?.profiles;
        const patName = `${pProf?.first_name || ''} ${pProf?.last_name || ''}`.toLowerCase();
        const apptIdStr = a.id.toLowerCase();
        if (!patName.includes(query) && !apptIdStr.includes(query)) return false;
      }

      return true;
    });
  }, [appointments, queueFilter, searchPatient]);

  const stats = useMemo(() => {
    const todayCount = appointments.filter((a) => isToday(a.start_time) && a.status !== 'CANCELLED').length;
    const upcomingCount = appointments.filter((a) => new Date(a.start_time) >= now && (a.status === 'CONFIRMED' || a.status === 'HELD')).length;
    const heldCount = appointments.filter((a) => a.status === 'HELD').length;
    const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;
    const cancelledCount = appointments.filter((a) => a.status === 'CANCELLED').length;
    const noShowCount = appointments.filter((a) => a.status === 'NO_SHOW').length;
    const rxCount = Object.keys(prescriptions).length;

    return { todayCount, upcomingCount, heldCount, completedCount, cancelledCount, noShowCount, rxCount };
  }, [appointments, prescriptions]);

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="dashboard-layout">
      <Navbar />

      <main className="dashboard-main">
        {/* Welcome Banner — Medical Teal */}
        <div
          className="dashboard-welcome-banner"
          style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 60%, #115e59 100%)' }}
        >
          <div>
            <h1>Dr. {profile?.first_name} {profile?.last_name}</h1>
            <p>
              {doctorInfo?.specialization || 'Clinical Specialist'} • {todayStr}
            </p>
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
              Doctor Practice Portal
            </span>
          </div>
        </div>

        {/* Statistics Grid — High Density & Visual Hierarchy */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.15rem',
          }}
        >
          {/* Card 1: Today's Patients — Light Blue */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Today's Patients
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8' }}>
                ACTIVE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : stats.todayCount}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>visits today</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#2563eb', fontWeight: 600, marginTop: '0.25rem' }}>
              Immediate consultation queue
            </div>
          </div>

          {/* Card 2: Upcoming Visits — Emerald Green */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Upcoming Visits
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#ecfdf5', color: '#047857' }}>
                SCHEDULED
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : stats.upcomingCount}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>future visits</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600, marginTop: '0.25rem' }}>
              Confirmed consultations
            </div>
          </div>

          {/* Card 3: Completed Records — Light Purple */}
          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Completed Visits
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9' }}>
                FINISHED
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : stats.completedCount}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>encounters</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600, marginTop: '0.25rem' }}>
              Clinical records documented
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #7e22ce' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                E-Prescriptions
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#faf5ff', color: '#7e22ce' }}>
                ISSUED
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : prescriptions.length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>completed</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7e22ce', fontWeight: 600, marginTop: '0.25rem' }}>
              Digital signed prescriptions
            </div>
          </div>

          <div className="dashboard-card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Total Patients
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fffbeb', color: '#b45309' }}>
                RECORD
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-heading)' }}>
                {apptLoading ? '—' : stats.uniquePatients}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>unique cases</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#b45309', fontWeight: 600, marginTop: '0.25rem' }}>
              Cumulative practice reach
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border-card)',
            paddingBottom: '0.65rem',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'overview' ? '#0d9488' : 'transparent',
              color: activeTab === 'overview' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'overview' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <ActivityIcon size={18} />
            Practice Overview
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'queue' ? '#0d9488' : 'transparent',
              color: activeTab === 'queue' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'queue' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <CalendarIcon size={18} />
            Patient Queue ({appointments.length})
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
            onClick={() => setActiveTab('schedule')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'schedule' ? '#0d9488' : 'transparent',
              color: activeTab === 'schedule' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'schedule' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <ClockIcon size={18} />
            Working Hours
          </button>

          <button
            onClick={() => setActiveTab('leaves')}
            style={{
              padding: '0.65rem 1.25rem',
              background: activeTab === 'leaves' ? '#0d9488' : 'transparent',
              color: activeTab === 'leaves' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === 'leaves' ? '0 2px 6px rgba(13, 148, 136, 0.25)' : 'none',
            }}
          >
            <BadgeCheckIcon size={18} />
            Leave Management ({leaves.length})
          </button>
        </div>


        {/* TAB 1: PRACTICE OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="dashboard-grid">
            <div className="dashboard-card" style={{ padding: '1.5rem' }}>
              <div className="card-header-with-icon" style={{ marginBottom: '1.25rem' }}>
                <div className="card-icon-wrapper teal">
                  <BadgeCheckIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>Provider Profile</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--slate-500)', marginTop: '0.15rem' }}>Specialization & licensing details</p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.85rem',
                  marginBottom: '0.85rem',
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
                      letterSpacing: '0.04em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Specialization
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#0f766e',
                    }}
                  >
                    {doctorInfo?.specialization || 'General Medicine'}
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
                      letterSpacing: '0.04em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    License Number
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.98rem',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: 'var(--slate-900)',
                    }}
                  >
                    {doctorInfo?.license_number || 'Pending'}
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
                      letterSpacing: '0.04em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Direct Contact
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
                      letterSpacing: '0.04em',
                      color: 'var(--slate-500)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Consultation Slot
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--slate-900)',
                    }}
                  >
                    {doctorInfo?.consultation_duration_minutes || 30} mins
                  </span>
                </div>
              </div>

              {/* Clinical Status */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#15803d',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Clinical Status
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      color: '#166534',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                    Active & Accepting Patients
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: '#dcfce7',
                    color: '#15803d',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '999px',
                    border: '1px solid #86efac',
                  }}
                >
                  ONLINE
                </span>
              </div>
            </div>

            <div className="dashboard-card">
              <div className="card-header-with-icon">
                <div className="card-icon-wrapper blue">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem' }}>Today's Schedule</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>Patient queue for {todayStr}</p>
                </div>
              </div>

              {appointments.filter((a) => isToday(a.start_time)).length === 0 ? (
                <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--slate-500)' }}>
                  <CalendarIcon size={32} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                  <p style={{ fontWeight: 600, color: 'var(--slate-700)' }}>No patient appointments today</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                  {appointments
                    .filter((a) => isToday(a.start_time))
                    .slice(0, 5)
                    .map((appt) => {
                      const pProf = appt.patient_profiles?.profiles;
                      const patName = pProf ? `${pProf.first_name} ${pProf.last_name}` : 'Patient';
                      const hasNote = !!consultNotes[appt.id];

                      return (
                        <div
                          key={appt.id}
                          style={{
                            padding: '0.75rem 1rem',
                            border: '1px solid var(--slate-200)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#f8fafc',
                            gap: '0.5rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--slate-800)' }}>
                              {patName}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--slate-500)' }}>
                              {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <StatusBadge status={appt.status} />
                            {appt.status === 'CONFIRMED' && (
                              <button
                                onClick={() => handleStartConsultation(appt)}
                                style={{
                                  padding: '0.35rem 0.75rem',
                                  background: '#0d9488',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {hasNote ? 'Edit Visit' : 'Start Visit'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <button
                onClick={() => setActiveTab('queue')}
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  padding: '0.6rem',
                  borderRadius: '8px',
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Open Full Appointment Queue →
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: APPOINTMENT QUEUE */}
        {activeTab === 'queue' && (
          <div>
            <div
              className="dashboard-card"
              style={{
                padding: '1rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--slate-50)',
                  border: '1.5px solid var(--slate-300)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.8rem',
                  gap: '0.5rem',
                  flex: '1 1 240px',
                }}
              >
                <SearchIcon size={16} style={{ color: 'var(--slate-400)' }} />
                <input
                  type="text"
                  placeholder="Search patient name or appointment ID..."
                  value={searchPatient}
                  onChange={(e) => setSearchPatient(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'today', label: "Today's" },
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'cancelled', label: 'Cancelled' },
                  { id: 'noshow', label: 'No-Show' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setQueueFilter(tab.id)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: queueFilter === tab.id ? '#0d9488' : 'var(--slate-200)',
                      background: queueFilter === tab.id ? '#f0fdfa' : '#fff',
                      color: queueFilter === tab.id ? '#0f766e' : 'var(--slate-600)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {apptLoading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--slate-500)' }}>
                <div className="spinner spinner-dark" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }}></div>
                <p>Loading patient queue...</p>
              </div>
            )}

            {!apptLoading && filteredQueue.length === 0 && (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <CalendarIcon size={36} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--slate-800)' }}>No appointments matching criteria</h4>
              </div>
            )}

            {!apptLoading && filteredQueue.length > 0 && (
              <div className="dashboard-card" style={{ overflowX: 'auto', padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--slate-200)', textAlign: 'left' }}>
                      <th style={tableHeadStyle}>Patient</th>
                      <th style={tableHeadStyle}>Scheduled Time</th>
                      <th style={tableHeadStyle}>Status</th>
                      <th style={tableHeadStyle}>Intake & Clinical Docs</th>
                      <th style={tableHeadStyle}>Contact Phone</th>
                      <th style={{ ...tableHeadStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueue.map((appt) => {
                      const pProf = appt.patient_profiles?.profiles;
                      const patName = pProf ? `${pProf.first_name} ${pProf.last_name}` : 'Patient';
                      const hasIntake = !!intakes[appt.id];
                      const hasNote = !!consultNotes[appt.id];
                      const hasRx = !!prescriptions[appt.id];

                      return (
                        <tr key={appt.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                          <td style={tableCellStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  borderRadius: '50%',
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                }}
                              >
                                {pProf?.first_name?.[0] || 'P'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--slate-900)' }}>{patName}</div>
                                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--slate-400)' }}>
                                  ID: {appt.id.substring(0, 8)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          <td style={tableCellStyle}>
                            <div style={{ fontWeight: 600, color: 'var(--slate-800)' }}>{formatDate(appt.start_time)}</div>
                            <div style={{ fontSize: '0.78rem', color: '#0d9488', fontWeight: 600 }}>
                              {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
                            </div>
                          </td>

                          <td style={tableCellStyle}>
                            <StatusBadge status={appt.status} />
                          </td>

                          <td style={tableCellStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {hasIntake ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#0f766e', background: '#ccfbf1', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                  Intake Received
                                </span>
                              ) : (
                                <span style={{ color: 'var(--slate-400)', fontSize: '0.72rem' }}>Intake Pending</span>
                              )}

                              {hasNote && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#1d4ed8', background: '#dbeafe', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                  Clinical Note ✓
                                </span>
                              )}

                              {hasRx && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#7e22ce', background: '#f3e8ff', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                  Prescription ✓ ({prescriptions[appt.id].status})
                                </span>
                              )}
                            </div>
                          </td>

                          <td style={tableCellStyle}>
                            {pProf?.phone_number ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                                <PhoneIcon size={13} style={{ color: 'var(--slate-400)' }} />
                                {pProf.phone_number}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--slate-400)', fontSize: '0.8rem' }}>Not provided</span>
                            )}
                          </td>

                          <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                              {appt.status === 'CONFIRMED' && (
                                <button
                                  onClick={() => handleStartConsultation(appt)}
                                  style={{
                                    padding: '0.4rem 0.75rem',
                                    background: '#0d9488',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                  }}
                                >
                                  <StethoscopeIcon size={14} />
                                  Consultation
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenPrescriptionModal(appt)}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  background: '#f3e8ff',
                                  color: '#7e22ce',
                                  border: '1px solid #d8b4fe',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <FileTextIcon size={13} />
                                Rx
                              </button>

                              <button onClick={() => handleOpenApptDetails(appt)} style={actionBtnSecondary}>
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: E-PRESCRIPTIONS */}
        {activeTab === 'prescriptions' && (
          <div>
            <div className="dashboard-card" style={{ marginBottom: '1.25rem' }}>
              <div className="card-header-with-icon">
                <div className="card-icon-wrapper purple" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                  <FileTextIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem' }}>E-Prescription & Medication Orders</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                    Authoritative doctor medication records with dosages, durations, and routes
                  </p>
                </div>
              </div>
            </div>

            {Object.keys(prescriptions).length === 0 ? (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <FileTextIcon size={36} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--slate-800)' }}>No prescriptions created yet</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  You can issue an official E-Prescription directly from the Appointment Queue.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {Object.values(prescriptions).map((rx) => {
                  const linkedAppt = appointments.find((a) => a.id === rx.appointment_id);
                  const pProf = linkedAppt?.patient_profiles?.profiles;
                  const patName = pProf ? `${pProf.first_name} ${pProf.last_name}` : 'Patient';

                  return (
                    <div
                      key={rx.id}
                      className="dashboard-card"
                      style={{
                        padding: '1.25rem',
                        borderLeft: '4px solid #7e22ce',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                              {patName}
                            </span>
                            <span
                              style={{
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: rx.status === 'FINALIZED' ? '#dcfce7' : '#fef9c3',
                                color: rx.status === 'FINALIZED' ? '#15803d' : '#854d0e',
                              }}
                            >
                              {rx.status}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                            Appointment: {formatDate(linkedAppt?.start_time)} • Rx ID: {rx.id.substring(0, 8)}...
                          </span>
                        </div>

                        {linkedAppt && (
                          <button
                            onClick={() => handleOpenPrescriptionModal(linkedAppt)}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: '#7e22ce',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <EditIcon size={14} />
                            {rx.status === 'FINALIZED' ? 'View / Edit Rx' : 'Edit Draft Rx'}
                          </button>
                        )}
                      </div>

                      {/* Medication Items */}
                      <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.85rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--slate-500)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                          Prescribed Medications ({rx.prescription_items?.length || 0})
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {(rx.prescription_items || []).map((item, idx) => (
                            <div
                              key={item.id || idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#fff',
                                padding: '0.6rem 0.8rem',
                                borderRadius: '6px',
                                border: '1px solid var(--slate-200)',
                                fontSize: '0.85rem',
                                flexWrap: 'wrap',
                                gap: '0.5rem',
                              }}
                            >
                              <div>
                                <strong style={{ color: 'var(--slate-900)' }}>{item.medication_name}</strong>{' '}
                                {item.strength && <span style={{ color: '#0d9488', fontWeight: 600 }}>({item.strength})</span>}
                                <div style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '0.1rem' }}>
                                  {item.dosage} • {item.frequency} • {item.route} • {item.duration}
                                </div>
                              </div>

                              {item.instructions && (
                                <span style={{ fontSize: '0.78rem', color: '#6b21a8', background: '#f3e8ff', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                  {item.instructions}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: WORKING HOURS */}
        {activeTab === 'hours' && (
          <div className="dashboard-card" style={{ maxWidth: '800px' }}>
            <div className="card-header-with-icon" style={{ marginBottom: '1.25rem' }}>
              <div className="card-icon-wrapper teal">
                <ClockIcon size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>Weekly Working Schedule</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                  Define recurring consultation availability
                </p>
              </div>
            </div>

            {hoursNotice.msg && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  background: hoursNotice.type === 'success' ? '#f0fdfa' : '#fef2f2',
                  color: hoursNotice.type === 'success' ? '#0f766e' : '#b91c1c',
                  border: `1px solid ${hoursNotice.type === 'success' ? '#ccfbf1' : '#fecaca'}`,
                }}
              >
                {hoursNotice.msg}
              </div>
            )}

            {hoursLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--slate-500)' }}>Loading schedule...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {workingHours.map((wh, idx) => (
                  <div
                    key={wh.day_of_week}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      background: wh.is_active ? '#ffffff' : '#f8fafc',
                      border: `1.5px solid ${wh.is_active ? 'var(--slate-300)' : 'var(--slate-200)'}`,
                      borderRadius: '10px',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '140px' }}>
                      <input
                        type="checkbox"
                        checked={wh.is_active}
                        onChange={(e) => {
                          const updated = [...workingHours];
                          updated[idx].is_active = e.target.checked;
                          setWorkingHours(updated);
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0d9488' }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: wh.is_active ? 'var(--slate-900)' : 'var(--slate-400)' }}>
                        {wh.day_name}
                      </span>
                    </div>

                    {wh.is_active ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="time"
                          value={wh.start_time}
                          onChange={(e) => {
                            const updated = [...workingHours];
                            updated[idx].start_time = e.target.value;
                            setWorkingHours(updated);
                          }}
                          style={timeInputStyle}
                        />
                        <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>to</span>
                        <input
                          type="time"
                          value={wh.end_time}
                          onChange={(e) => {
                            const updated = [...workingHours];
                            updated[idx].end_time = e.target.value;
                            setWorkingHours(updated);
                          }}
                          style={timeInputStyle}
                        />
                      </div>
                    ) : (
                      <span style={{ color: 'var(--slate-400)', fontSize: '0.82rem', fontStyle: 'italic' }}>Off</span>
                    )}
                  </div>
                ))}

                <button
                  onClick={handleSaveWorkingHours}
                  disabled={hoursSaving}
                  style={{
                    marginTop: '1.25rem',
                    padding: '0.85rem',
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: hoursSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {hoursSaving ? 'Saving Working Hours...' : 'Save Working Hours'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: LEAVE MANAGEMENT */}
        {activeTab === 'leaves' && (
          <div>
            <div className="dashboard-card" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Doctor Leave Management
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                  Block out dates to prevent patient bookings
                </p>
              </div>

              <button
                onClick={() => {
                  setNewLeaveStart('');
                  setNewLeaveEnd('');
                  setNewLeaveReason('');
                  setLeaveError('');
                  setLeaveModalOpen(true);
                }}
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
                <PlusIcon size={16} />
                Schedule Time Off
              </button>
            </div>

            {leavesLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--slate-500)' }}>Loading scheduled leaves...</div>
            ) : leaves.length === 0 ? (
              <div className="dashboard-card" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--slate-500)' }}>
                <BadgeCheckIcon size={36} style={{ color: 'var(--slate-400)', margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--slate-800)' }}>No leaves currently scheduled</h4>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {leaves.map((leave) => {
                  const isPastLeave = new Date(leave.end_time) < now;

                  return (
                    <div
                      key={leave.id}
                      className="dashboard-card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        background: isPastLeave ? '#f8fafc' : '#fff',
                        opacity: isPastLeave ? 0.7 : 1,
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--slate-900)' }}>
                          {leave.reason || 'Scheduled Leave'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--slate-500)', marginTop: '0.2rem' }}>
                          {formatDate(leave.start_time)} ({formatTime(leave.start_time)}) → {formatDate(leave.end_time)} ({formatTime(leave.end_time)})
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteLeave(leave.id)}
                        disabled={deletingLeaveId === leave.id}
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#b91c1c',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.8rem',
                        }}
                      >
                        <TrashIcon size={14} />
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════════════
          E-PRESCRIPTION BUILDER MODAL
         ══════════════════════════════════════════════════════════════════════════ */}
      {rxModalOpen && rxAppt && (
        <div
          style={modalOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRxModalOpen(false);
          }}
        >
          <div style={{ ...modalCardStyle, maxWidth: '900px', maxHeight: '92vh' }}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileTextIcon size={20} style={{ color: '#7e22ce' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    E-Prescription & Medication Order (Rx)
                  </h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6b21a8', fontWeight: 600, marginTop: '0.2rem' }}>
                  Patient: {rxAppt.patient_profiles?.profiles?.first_name} {rxAppt.patient_profiles?.profiles?.last_name} • {formatDate(rxAppt.start_time)}
                </p>
              </div>

              <button onClick={() => setRxModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {rxError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                  {rxError}
                </div>
              )}

              {rxSuccessNotice && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', color: '#0f766e', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
                  {rxSuccessNotice}
                </div>
              )}

              {/* Clinical Diagnosis / Condition */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
                <label style={formLabelStyle}>Clinical Diagnosis / Primary Indication</label>
                <input
                  type="text"
                  placeholder="E.g. Type 2 Diabetes Mellitus, Acute Bronchitis, Essential Hypertension..."
                  value={rxDiagnosis}
                  onChange={(e) => setRxDiagnosis(e.target.value)}
                  style={{ ...formInputStyle, background: '#ffffff', marginTop: '0.35rem' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.35rem 0 0 0' }}>
                  If left blank, the patient's care summary will indicate that no diagnosis was formally specified.
                </p>
              </div>

              {/* Medication Items List */}
              <div style={{ background: '#fdf4ff', border: '1.5px solid #f0abfc', borderRadius: '12px', padding: '1.25rem' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#86198f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Prescribed Medications
                  </h4>

                  <button
                    type="button"
                    onClick={handleAddMedicineRow}
                    style={{
                      padding: '0.35rem 0.8rem',
                      background: '#7e22ce',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <PlusIcon size={14} />
                    Add Medicine
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {rxItems.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e9d5ff',
                        borderRadius: '10px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6b21a8' }}>
                          Medicine #{index + 1}
                        </span>

                        {rxItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicineRow(index)}
                            style={{
                              background: '#fee2e2',
                              border: '1px solid #fca5a5',
                              color: '#b91c1c',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={formLabelStyle}>Medication Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="E.g. Amoxicillin, Metformin, Lisinopril..."
                            value={item.medication_name}
                            onChange={(e) => handleUpdateMedicineField(index, 'medication_name', e.target.value)}
                            style={formInputStyle}
                          />
                        </div>

                        <div>
                          <label style={formLabelStyle}>Strength</label>
                          <input
                            type="text"
                            placeholder="E.g. 500mg, 10mg..."
                            value={item.strength}
                            onChange={(e) => handleUpdateMedicineField(index, 'strength', e.target.value)}
                            style={formInputStyle}
                          />
                        </div>

                        <div>
                          <label style={formLabelStyle}>Dosage</label>
                          <input
                            type="text"
                            placeholder="E.g. 1 tablet, 5ml..."
                            value={item.dosage}
                            onChange={(e) => handleUpdateMedicineField(index, 'dosage', e.target.value)}
                            style={formInputStyle}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={formLabelStyle}>Frequency</label>
                          <select
                            value={item.frequency}
                            onChange={(e) => handleUpdateMedicineField(index, 'frequency', e.target.value)}
                            style={formInputStyle}
                          >
                            {FREQUENCY_OPTIONS.map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={formLabelStyle}>Route</label>
                          <select
                            value={item.route}
                            onChange={(e) => handleUpdateMedicineField(index, 'route', e.target.value)}
                            style={formInputStyle}
                          >
                            {ROUTE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={formLabelStyle}>Duration</label>
                          <input
                            type="text"
                            placeholder="E.g. 5 days, 1 mo..."
                            value={item.duration}
                            onChange={(e) => handleUpdateMedicineField(index, 'duration', e.target.value)}
                            style={formInputStyle}
                          />
                        </div>

                        <div>
                          <label style={formLabelStyle}>Quantity</label>
                          <input
                            type="text"
                            placeholder="E.g. 14 tabs..."
                            value={item.quantity}
                            onChange={(e) => handleUpdateMedicineField(index, 'quantity', e.target.value)}
                            style={formInputStyle}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={formLabelStyle}>Patient Usage Instructions</label>
                        <input
                          type="text"
                          placeholder="E.g. Take immediately after meals with plenty of water..."
                          value={item.instructions}
                          onChange={(e) => handleUpdateMedicineField(index, 'instructions', e.target.value)}
                          style={formInputStyle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* General Prescription Notes */}
              <div>
                <label style={formLabelStyle}>General Doctor Notes / Pharmacy Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Special instructions for patient or pharmacist..."
                  value={rxNotes}
                  onChange={(e) => setRxNotes(e.target.value)}
                  style={formInputStyle}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setRxModalOpen(false)}
                  style={{
                    padding: '0.75rem 1.25rem',
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

                <button
                  type="button"
                  onClick={() => handleSavePrescription(false)}
                  disabled={rxSaving}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: '#ffffff',
                    color: '#7e22ce',
                    border: '1.5px solid #a855f7',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: rxSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {rxSaving ? 'Saving...' : 'Save Rx Draft'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSavePrescription(true)}
                  disabled={rxSaving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#7e22ce',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: rxSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <CheckCircleIcon size={16} />
                  {rxSaving ? 'Finalizing...' : 'Finalize & Sign E-Prescription'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONSULTATION ENCOUNTER MODAL */}
      {consultModalOpen && activeConsultAppt && (
        <div
          style={modalOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConsultModalOpen(false);
          }}
        >
          <div style={{ ...modalCardStyle, maxWidth: '850px', maxHeight: '92vh' }}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <StethoscopeIcon size={20} style={{ color: '#0d9488' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    Clinical Consultation & Examination Record
                  </h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#0f766e', fontWeight: 600, marginTop: '0.2rem' }}>
                  Patient: {activeConsultAppt.patient_profiles?.profiles?.first_name} {activeConsultAppt.patient_profiles?.profiles?.last_name} • {formatDate(activeConsultAppt.start_time)}
                </p>
              </div>
              <button onClick={() => setConsultModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {consultError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                  {consultError}
                </div>
              )}

              {consultSuccessNotice && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', color: '#0f766e', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
                  {consultSuccessNotice}
                </div>
              )}

              {/* Patient Pre-Visit Intake Context */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '1.1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <FileTextIcon size={14} />
                    Patient-Submitted Pre-Visit Intake (Read-Only)
                  </span>

                  {activeConsultIntake && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '999px', background: (SEVERITY_COLORS[activeConsultIntake.severity] || SEVERITY_COLORS.MODERATE).bg, color: (SEVERITY_COLORS[activeConsultIntake.severity] || SEVERITY_COLORS.MODERATE).text }}>
                      Severity: {activeConsultIntake.severity}
                    </span>
                  )}
                </div>

                {!activeConsultIntake ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--slate-400)', fontStyle: 'italic', margin: 0 }}>
                    Patient did not submit a pre-visit symptom intake prior to consultation.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.82rem' }}>
                    <div>
                      <strong style={{ color: 'var(--slate-700)' }}>Chief Complaint:</strong> {activeConsultIntake.chief_complaint}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--slate-700)' }}>Onset / Duration:</strong> {activeConsultIntake.symptom_onset || 'Not specified'}
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <strong style={{ color: 'var(--slate-700)' }}>Reported Symptoms:</strong> {activeConsultIntake.symptoms}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--slate-700)' }}>Medications:</strong> {activeConsultIntake.current_medications || 'None reported'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--slate-700)' }}>Allergies:</strong>{' '}
                      <span style={{ color: activeConsultIntake.allergies && activeConsultIntake.allergies.toLowerCase() !== 'none' ? '#b91c1c' : 'inherit', fontWeight: activeConsultIntake.allergies && activeConsultIntake.allergies.toLowerCase() !== 'none' ? 700 : 400 }}>
                        {activeConsultIntake.allergies || 'No known allergies'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Pre-Visit Clinical Summary & Triage */}
              {activeConsultIntake && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <SparklesIcon size={18} style={{ color: '#6366f1' }} />
                      <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>
                        AI Pre-Visit Clinical Summary & Triage
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {aiSummaryLoading ? (
                        <span style={{ fontSize: '0.78rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                          <div className="spinner spinner-dark" style={{ width: '12px', height: '12px' }}></div>
                          Analyzing Symptoms...
                        </span>
                      ) : aiSummary ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.65rem',
                            borderRadius: '999px',
                            background:
                              aiSummary.urgency === 'High'
                                ? '#fee2e2'
                                : aiSummary.urgency === 'Low'
                                ? '#dcfce7'
                                : '#fef3c7',
                            color:
                              aiSummary.urgency === 'High'
                                ? '#b91c1c'
                                : aiSummary.urgency === 'Low'
                                ? '#15803d'
                                : '#b45309',
                            border: `1px solid ${
                              aiSummary.urgency === 'High'
                                ? '#fca5a5'
                                : aiSummary.urgency === 'Low'
                                ? '#86efac'
                                : '#fcd34d'
                            }`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background:
                                aiSummary.urgency === 'High'
                                  ? '#b91c1c'
                                  : aiSummary.urgency === 'Low'
                                  ? '#15803d'
                                  : '#b45309',
                            }}
                          ></span>
                          Urgency: {aiSummary.urgency}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => fetchOrGenerateAiSummary(activeConsultAppt.id, activeConsultIntake, true)}
                        disabled={aiSummaryLoading}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '0.25rem 0.6rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: aiSummaryLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {aiSummaryLoading ? 'Analyzing...' : 'Re-run AI'}
                      </button>
                    </div>
                  </div>

                  {aiSummaryError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                      {aiSummaryError}
                    </div>
                  )}

                  {aiSummary ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                          Extracted Chief Complaint
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                          {aiSummary.chief_complaint}
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                          Suggested Questions for Doctor (3 Clinical Probes)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {(aiSummary.suggested_questions || []).map((q, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.5rem',
                                fontSize: '0.8rem',
                                color: '#334155',
                                background: '#f8fafc',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid #f1f5f9',
                              }}
                            >
                              <span
                                style={{
                                  background: '#e0e7ff',
                                  color: '#4338ca',
                                  fontWeight: 800,
                                  fontSize: '0.7rem',
                                  borderRadius: '50%',
                                  width: '18px',
                                  height: '18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginTop: '1px',
                                }}
                              >
                                {idx + 1}
                              </span>
                              <span>{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>
                        ⚖️ <strong>Disclaimer:</strong> AI-generated pre-visit summary. This is an administrative triage aid, not a medical diagnosis, and does not replace clinical judgment.
                      </p>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                      Click "Re-run AI" above to generate a pre-visit summary from the patient's symptoms.
                    </div>
                  )}
                </div>
              )}

              {/* Doctor Consultation Notes */}
              <div
                style={{
                  background: '#f0fdfa',
                  border: '1.5px solid #ccfbf1',
                  borderRadius: '12px',
                  padding: '1.25rem',
                }}
              >

                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f766e', marginBottom: '1rem', textTransform: 'uppercase' }}>
                  Doctor Clinical Assessment & Care Plan
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={formLabelStyle}>Clinical Diagnosis / Assessment *</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g. Acute Bronchitis, Tension Headache, Essential Hypertension..."
                      value={consultForm.diagnosis}
                      onChange={(e) => setConsultForm({ ...consultForm, diagnosis: e.target.value })}
                      style={{ ...formInputStyle, background: '#fff' }}
                    />
                  </div>

                  <div>
                    <label style={formLabelStyle}>Clinical Observations & Physical Examination Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Physical findings, vital observations, lung sounds, tenderness, etc..."
                      value={consultForm.examination_notes}
                      onChange={(e) => setConsultForm({ ...consultForm, examination_notes: e.target.value })}
                      style={{ ...formInputStyle, background: '#fff' }}
                    />
                  </div>

                  <div>
                    <label style={formLabelStyle}>Treatment Plan & Clinical Summary *</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Medication regimen, dosage, lifestyle recommendations, clinical orders..."
                      value={consultForm.treatment_plan}
                      onChange={(e) => setConsultForm({ ...consultForm, treatment_plan: e.target.value })}
                      style={{ ...formInputStyle, background: '#fff' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={formLabelStyle}>Follow-up Instructions</label>
                      <input
                        type="text"
                        placeholder="E.g. Return in 2 weeks if fever persists, schedule blood test..."
                        value={consultForm.follow_up_instructions}
                        onChange={(e) => setConsultForm({ ...consultForm, follow_up_instructions: e.target.value })}
                        style={{ ...formInputStyle, background: '#fff' }}
                      />
                    </div>

                    <div>
                      <label style={formLabelStyle}>Follow-up Date</label>
                      <input
                        type="date"
                        min={todayISO()}
                        value={consultForm.follow_up_date}
                        onChange={(e) => setConsultForm({ ...consultForm, follow_up_date: e.target.value })}
                        style={{ ...formInputStyle, background: '#fff' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={formLabelStyle}>Physician Private / Confidential Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Internal medical notes..."
                      value={consultForm.doctor_notes}
                      onChange={(e) => setConsultForm({ ...consultForm, doctor_notes: e.target.value })}
                      style={{ ...formInputStyle, background: '#fff' }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setConsultModalOpen(false)}
                  style={{
                    padding: '0.75rem 1.25rem',
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

                <button
                  type="button"
                  onClick={() => {
                    setConsultModalOpen(false);
                    handleOpenPrescriptionModal(activeConsultAppt);
                  }}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: '#f3e8ff',
                    color: '#7e22ce',
                    border: '1.5px solid #d8b4fe',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Write E-Prescription (Rx) →
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveConsultation(false)}
                  disabled={consultSaving}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: '#ffffff',
                    color: '#0f766e',
                    border: '1.5px solid #0d9488',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: consultSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {consultSaving ? 'Saving...' : 'Save Draft'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveConsultation(true)}
                  disabled={consultSaving}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: consultSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <CheckCircleIcon size={16} />
                  {consultSaving ? 'Finalizing...' : 'Finalize & Complete Visit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT DETAILS MODAL */}
      {selectedAppt && (
        <div
          style={modalOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedAppt(null);
          }}
        >
          <div style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                  Clinical Consultation Details
                </h3>
                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--slate-500)' }}>
                  ID: {selectedAppt.id}
                </span>
              </div>
              <button onClick={() => setSelectedAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {statusActionError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {statusActionError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--slate-100)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)', fontWeight: 600 }}>Status:</span>
                <StatusBadge status={selectedAppt.status} />
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--slate-600)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Patient Identity & Contact
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Name:</span>
                  <span style={{ fontWeight: 700, color: 'var(--slate-900)' }}>
                    {selectedAppt.patient_profiles?.profiles?.first_name} {selectedAppt.patient_profiles?.profiles?.last_name}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Phone:</span>
                  <span style={{ fontWeight: 600 }}>
                    {selectedAppt.patient_profiles?.profiles?.phone_number || 'Not provided'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Scheduled Time:</span>
                  <span style={{ fontWeight: 700, color: '#0d9488' }}>
                    {formatDate(selectedAppt.start_time)} ({formatTime(selectedAppt.start_time)} – {formatTime(selectedAppt.end_time)})
                  </span>
                </div>
              </div>

              {/* Linked Consultation Note */}
              {consultNotes[selectedAppt.id] && (
                <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                      Clinical Diagnosis
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                      {consultNotes[selectedAppt.id].is_finalized ? 'Finalized' : 'Draft'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--slate-900)' }}>
                    {consultNotes[selectedAppt.id].diagnosis}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', marginTop: '0.3rem' }}>
                    <strong>Treatment:</strong> {consultNotes[selectedAppt.id].treatment_plan}
                  </div>
                </div>
              )}

              {/* Linked Prescription */}
              {prescriptions[selectedAppt.id] && (
                <div style={{ background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase' }}>
                      E-Prescription ({prescriptions[selectedAppt.id].status})
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b21a8', background: '#f3e8ff', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                      {prescriptions[selectedAppt.id].prescription_items?.length || 0} Medications
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--slate-700)' }}>
                    {(prescriptions[selectedAppt.id].prescription_items || []).map((i) => i.medication_name).join(', ')}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    setSelectedAppt(null);
                    handleOpenPrescriptionModal(selectedAppt);
                  }}
                  style={{
                    ...modalActionSuccess,
                    background: '#7e22ce',
                  }}
                >
                  <FileTextIcon size={16} />
                  Write / Manage E-Prescription (Rx)
                </button>

                {selectedAppt.status === 'CONFIRMED' && (
                  <button
                    onClick={() => {
                      setSelectedAppt(null);
                      handleStartConsultation(selectedAppt);
                    }}
                    style={modalActionSuccess}
                  >
                    <StethoscopeIcon size={16} />
                    Start / Edit Consultation Record
                  </button>
                )}

                {selectedAppt.status === 'CONFIRMED' && (
                  <button
                    onClick={() => handleUpdateApptStatus(selectedAppt.id, 'NO_SHOW')}
                    disabled={statusUpdating}
                    style={modalActionWarning}
                  >
                    Mark Patient as No-Show
                  </button>
                )}

                {(selectedAppt.status === 'HELD' || selectedAppt.status === 'CONFIRMED') && (
                  <button
                    onClick={() => {
                      const reason = window.prompt('Enter cancellation reason (optional):');
                      if (reason !== null) {
                        handleUpdateApptStatus(selectedAppt.id, 'CANCELLED', reason || 'Cancelled by provider');
                      }
                    }}
                    disabled={statusUpdating}
                    style={modalActionDanger}
                  >
                    Cancel Consultation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE LEAVE MODAL */}
      {leaveModalOpen && (
        <div
          style={modalOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaveModalOpen(false);
          }}
        >
          <div style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                Schedule Time Off / Leave
              </h3>
              <button onClick={() => setLeaveModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
                <XIcon size={20} />
              </button>
            </div>

            <form onSubmit={handleAddLeave} style={{ padding: '1.5rem' }}>
              {leaveError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {leaveError}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Leave Start Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={newLeaveStart}
                  onChange={(e) => setNewLeaveStart(e.target.value)}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={formLabelStyle}>Leave End Date & Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={newLeaveEnd}
                  onChange={(e) => setNewLeaveEnd(e.target.value)}
                  style={formInputStyle}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={formLabelStyle}>Reason / Note (Optional)</label>
                <input
                  type="text"
                  placeholder="E.g. Medical conference, Annual leave, Personal..."
                  value={newLeaveReason}
                  onChange={(e) => setNewLeaveReason(e.target.value)}
                  style={formInputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="submit"
                  disabled={leaveSaving}
                  style={{
                    flex: 1,
                    padding: '0.8rem',
                    background: '#0d9488',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: leaveSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {leaveSaving ? 'Saving Leave...' : 'Confirm Leave Schedule'}
                </button>

                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  style={{
                    padding: '0.8rem 1.25rem',
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
    </div>
  );
};

const tableHeadStyle = {
  padding: '0.85rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--slate-600)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tableCellStyle = {
  padding: '0.9rem 1rem',
  fontSize: '0.85rem',
  color: 'var(--slate-700)',
};

const actionBtnSecondary = {
  padding: '0.35rem 0.7rem',
  background: '#f1f5f9',
  color: 'var(--slate-700)',
  border: '1px solid var(--slate-300)',
  borderRadius: '6px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const timeInputStyle = {
  padding: '0.4rem 0.6rem',
  border: '1px solid var(--slate-300)',
  borderRadius: '6px',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--slate-800)',
  background: '#ffffff',
  outline: 'none',
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  backdropFilter: 'blur(4px)',
};

const modalCardStyle = {
  background: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  width: '100%',
  maxWidth: '560px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1.25rem 1.5rem',
  borderBottom: '1px solid var(--slate-200)',
  background: '#f8fafc',
};

const modalActionSuccess = {
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
};

const modalActionWarning = {
  width: '100%',
  padding: '0.75rem',
  background: '#d97706',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

const modalActionDanger = {
  width: '100%',
  padding: '0.75rem',
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
};

const formLabelStyle = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: 'var(--slate-700)',
  marginBottom: '0.35rem',
};

const formInputStyle = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  border: '1.5px solid var(--slate-300)',
  borderRadius: '8px',
  fontSize: '0.88rem',
  color: 'var(--slate-800)',
  outline: 'none',
  fontFamily: 'inherit',
};
