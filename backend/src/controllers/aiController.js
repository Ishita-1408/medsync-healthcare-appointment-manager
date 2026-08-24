import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { generatePreVisitSummary } from '../services/aiService.js';

const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * Controller to generate or fetch AI Pre-Visit Summary
 * @route POST /api/ai/pre-visit-summary
 */
export async function getOrGeneratePreVisitSummary(req, res, next) {
  try {
    const { appointment_id, force_regenerate } = req.body;
    const userId = req.user.id;

    if (!appointment_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: appointment_id.',
      });
    }

    // 1. Fetch appointment & verify ownership
    const { data: appointment, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, doctor_id, start_time, status')
      .eq('id', appointment_id)
      .maybeSingle();

    if (apptErr || !appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found.',
      });
    }

    if (appointment.patient_id !== userId && appointment.doctor_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have permission to access clinical data for this appointment.',
      });
    }

    // 2. Deduplication check: Return existing summary if present and not force-regenerating
    if (!force_regenerate) {
      const { data: existingSummary } = await supabaseAdmin
        .from('ai_pre_visit_summaries')
        .select('*')
        .eq('appointment_id', appointment_id)
        .eq('status', 'COMPLETED')
        .maybeSingle();

      if (existingSummary) {
        return res.status(200).json({
          success: true,
          cached: true,
          data: {
            id: existingSummary.id,
            appointment_id: existingSummary.appointment_id,
            urgency: existingSummary.urgency,
            chief_complaint: existingSummary.chief_complaint,
            suggested_questions: existingSummary.suggested_questions,
            model_used: existingSummary.model_used,
            created_at: existingSummary.created_at,
          },
        });
      }
    }

    // 3. Fetch patient intake
    const { data: intake, error: intakeErr } = await supabaseAdmin
      .from('appointment_intakes')
      .select('*')
      .eq('appointment_id', appointment_id)
      .maybeSingle();

    if (!intake) {
      return res.status(404).json({
        success: false,
        error: 'Patient has not submitted a pre-visit symptom intake for this appointment yet.',
      });
    }

    // 4. Generate AI summary via AI Service
    let aiResult;
    try {
      aiResult = await generatePreVisitSummary(intake);
    } catch (aiErr) {
      console.error('AI Generation error:', aiErr);
      return res.status(503).json({
        success: false,
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'The AI pre-visit summary could not be generated at this time: ' + aiErr.message,
        },
      });
    }

    // 5. Store generated summary in database
    const summaryPayload = {
      appointment_id: appointment.id,
      intake_id: intake.id,
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      urgency: aiResult.urgency,
      chief_complaint: aiResult.chief_complaint,
      suggested_questions: aiResult.suggested_questions,
      model_used: aiResult.model_used || 'clinical-nlp-v1',
      status: 'COMPLETED',
    };

    const { data: savedRecord, error: saveErr } = await supabaseAdmin
      .from('ai_pre_visit_summaries')
      .upsert(summaryPayload, { onConflict: 'appointment_id' })
      .select()
      .single();

    if (saveErr) {
      console.warn('Could not persist AI summary to DB (table might be freshly deploying):', saveErr.message);
    }

    return res.status(200).json({
      success: true,
      cached: false,
      data: {
        id: savedRecord?.id || null,
        appointment_id: appointment.id,
        urgency: aiResult.urgency,
        chief_complaint: aiResult.chief_complaint,
        suggested_questions: aiResult.suggested_questions,
        model_used: aiResult.model_used,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller to generate or fetch AI Post-Visit Patient-Friendly Summary
 * @route POST /api/ai/post-visit-summary
 */
export async function getOrGeneratePostVisitSummary(req, res, next) {
  try {
    const { appointment_id, force_regenerate } = req.body;
    const userId = req.user.id;

    if (!appointment_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: appointment_id.',
      });
    }

    // 1. Fetch appointment & verify ownership
    const { data: appointment, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, doctor_id, start_time, status')
      .eq('id', appointment_id)
      .maybeSingle();

    if (apptErr || !appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found.',
      });
    }

    if (appointment.patient_id !== userId && appointment.doctor_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have permission to access clinical summaries for this appointment.',
      });
    }

    // 2. Fetch finalized consultation notes
    const { data: consultation, error: consultErr } = await supabaseAdmin
      .from('consultation_notes')
      .select('*')
      .eq('appointment_id', appointment_id)
      .maybeSingle();

    if (!consultation || !consultation.is_finalized) {
      return res.status(400).json({
        success: false,
        error: 'Consultation notes have not been finalized by the doctor yet.',
      });
    }

    // 3. Fetch authoritative prescription items
    let prescriptionItems = [];
    const { data: rxHeader } = await supabaseAdmin
      .from('prescriptions')
      .select('id, status')
      .eq('appointment_id', appointment_id)
      .maybeSingle();

    if (rxHeader) {
      const { data: items } = await supabaseAdmin
        .from('prescription_items')
        .select('*')
        .eq('prescription_id', rxHeader.id);

      if (items) prescriptionItems = items;
    }

    // 4. Smart Deduplication: Return cached summary only if it reflects current prescription count
    if (!force_regenerate) {
      const { data: existingSummary } = await supabaseAdmin
        .from('ai_post_visit_summaries')
        .select('*')
        .eq('appointment_id', appointment_id)
        .eq('status', 'COMPLETED')
        .maybeSingle();

      const existingMedCount = existingSummary?.medications?.length || 0;
      if (existingSummary && existingMedCount === prescriptionItems.length) {
        return res.status(200).json({
          success: true,
          cached: true,
          data: {
            id: existingSummary.id,
            appointment_id: existingSummary.appointment_id,
            summary: existingSummary.summary,
            diagnosis_explanation: existingSummary.diagnosis_explanation,
            medications: existingSummary.medications,
            follow_up: existingSummary.follow_up,
            model_used: existingSummary.model_used,
            created_at: existingSummary.created_at,
          },
        });
      }
    }

    // 5. Generate AI Post-Visit Summary
    const { generatePostVisitSummary } = await import('../services/aiService.js');
    let aiResult;

    try {
      aiResult = await generatePostVisitSummary(consultation, prescriptionItems);
    } catch (aiErr) {
      console.error('AI Post-Visit generation error:', aiErr);
      return res.status(503).json({
        success: false,
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'The patient-friendly summary could not be generated at this time: ' + aiErr.message,
        },
      });
    }

    // 6. Persist to database
    const postSummaryPayload = {
      appointment_id: appointment.id,
      consultation_id: consultation.id,
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      prescription_id: rxHeader?.id || null,
      summary: aiResult.summary,
      diagnosis_explanation: aiResult.diagnosis_explanation,
      medications: aiResult.medications,
      follow_up: aiResult.follow_up,
      model_used: aiResult.model_used || 'clinical-nlp-v1',
      status: 'COMPLETED',
    };

    const { data: savedRecord, error: saveErr } = await supabaseAdmin
      .from('ai_post_visit_summaries')
      .upsert(postSummaryPayload, { onConflict: 'appointment_id' })
      .select()
      .single();

    if (saveErr) {
      console.warn('Could not persist post-visit summary to DB:', saveErr.message);
    }

    return res.status(200).json({
      success: true,
      cached: false,
      data: {
        id: savedRecord?.id || null,
        appointment_id: appointment.id,
        summary: aiResult.summary,
        diagnosis_explanation: aiResult.diagnosis_explanation,
        medications: aiResult.medications,
        follow_up: aiResult.follow_up,
        model_used: aiResult.model_used,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

