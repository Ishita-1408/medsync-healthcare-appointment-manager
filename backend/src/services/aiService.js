import { config } from '../config/index.js';

// ==============================================================================
// 1. PRE-VISIT SUMMARY LOGIC & VALIDATION
// ==============================================================================

function validatePreVisitSummaryResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI response is not a valid JSON object.');
  }

  const validUrgencies = ['Low', 'Medium', 'High'];
  let urgency = String(data.urgency || '').trim();
  urgency = urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase();

  if (!validUrgencies.includes(urgency)) {
    urgency = 'Medium';
  }

  const chiefComplaint = String(data.chief_complaint || '').trim();
  if (!chiefComplaint) {
    throw new Error('AI response missing valid chief_complaint field.');
  }

  let questions = Array.isArray(data.suggested_questions) ? data.suggested_questions : [];
  questions = questions
    .map((q) => String(q).trim())
    .filter((q) => q.length > 0);

  if (questions.length < 3) {
    const defaultQuestions = [
      'How long have you been experiencing these symptoms and has anything made them better or worse?',
      'Are you experiencing any other symptoms such as fever, dizziness, or shortness of breath?',
      'Have you tried any home remedies or over-the-counter medications for this issue?',
    ];
    while (questions.length < 3) {
      questions.push(defaultQuestions[questions.length]);
    }
  } else if (questions.length > 3) {
    questions = questions.slice(0, 3);
  }

  return {
    urgency,
    chief_complaint: chiefComplaint,
    suggested_questions: questions,
  };
}

function generateDeterministicPreVisitFallback(intake) {
  const symptoms = (intake.symptoms || '').toLowerCase();
  const rawSeverity = (intake.severity || 'MODERATE').toUpperCase();
  const onset = intake.symptom_onset || 'recently';
  const chief = intake.chief_complaint || intake.symptoms || 'General Consultation';

  let urgency = 'Medium';
  const criticalKeywords = ['chest pain', 'shortness of breath', 'severe bleeding', 'loss of consciousness', 'stroke', 'unbearable'];
  const highKeywords = ['high fever', 'severe pain', 'difficulty breathing', 'vomiting blood', 'head trauma', 'acute'];
  const lowKeywords = ['mild', 'routine', 'annual checkup', 'minor rash', 'slight', 'preventive', 'refill'];

  if (rawSeverity === 'CRITICAL' || criticalKeywords.some((k) => symptoms.includes(k))) {
    urgency = 'High';
  } else if (rawSeverity === 'SEVERE' || highKeywords.some((k) => symptoms.includes(k))) {
    urgency = 'High';
  } else if (rawSeverity === 'MILD' || lowKeywords.some((k) => symptoms.includes(k))) {
    urgency = 'Low';
  } else {
    urgency = 'Medium';
  }

  const suggestedQuestions = [
    `Can you describe when the ${chief.toLowerCase()} first began and how it has changed since ${onset}?`,
    `Are the symptoms constant or intermittent, and do any specific activities or positions trigger them?`,
    `Have you experienced any previous episodes of this condition or related medical issues in the past?`,
  ];

  return {
    urgency,
    chief_complaint: chief.trim(),
    suggested_questions: suggestedQuestions,
    model_used: 'clinical-rules-fallback-v1',
  };
}

export async function generatePreVisitSummary(intake) {
  if (!intake) {
    throw new Error('Patient intake information is required to generate AI summary.');
  }

  const promptText = `
Chief Complaint: ${intake.chief_complaint || 'Not specified'}
Symptoms: ${intake.symptoms || 'Not specified'}
Onset / Duration: ${intake.symptom_onset || 'Not specified'}
Reported Severity: ${intake.severity || 'MODERATE'}
Symptom Progression: ${intake.progression || 'SAME'}
Current Medications: ${intake.current_medications || 'None'}
Known Allergies: ${intake.allergies || 'None'}
Existing Medical Conditions: ${intake.existing_conditions || 'None'}
Additional Patient Notes: ${intake.additional_notes || 'None'}
`.trim();

  // OpenAI
  if (config.ai.openaiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an administrative medical assistant in a healthcare clinic helping the doctor prepare before meeting the patient.
SAFETY & CLINICAL RULES:
1. Do NOT diagnose the patient.
2. Do NOT recommend treatments or prescribe medications.
3. Do NOT invent symptoms not mentioned in the intake.
4. Extract the chief complaint concisely.
5. Determine administrative triage urgency as: "Low", "Medium", or "High".
6. Provide exactly 3 clinical history questions for the doctor to ask the patient.
7. Return ONLY a valid JSON object with keys: "urgency", "chief_complaint", "suggested_questions" (array of 3 strings).`,
            },
            {
              role: 'user',
              content: promptText,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 400,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const parsed = JSON.parse(result.choices?.[0]?.message?.content);
        const validated = validatePreVisitSummaryResponse(parsed);
        return { ...validated, model_used: result.model || 'gpt-4o-mini' };
      }
    } catch (err) {
      console.warn('OpenAI pre-visit call failed, falling back:', err.message);
    }
  }

  // Gemini
  if (config.ai.geminiApiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.ai.geminiApiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{
                text: `You are an administrative medical triage assistant for MedSync clinic.
Analyze these patient-reported symptoms and return a JSON object with:
- "urgency": "Low" | "Medium" | "High"
- "chief_complaint": string
- "suggested_questions": [string, string, string] (exactly 3 questions for doctor)

PATIENT INTAKE:
${promptText}

Respond ONLY in valid JSON.`,
              }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(rawText);
        const validated = validatePreVisitSummaryResponse(parsed);
        return { ...validated, model_used: 'gemini-1.5-flash' };
      }
    } catch (err) {
      console.warn('Gemini pre-visit call failed, falling back:', err.message);
    }
  }

  return generateDeterministicPreVisitFallback(intake);
}

// ==============================================================================
// 2. POST-VISIT SUMMARY LOGIC & MEDICATION INTEGRITY VALIDATION
// ==============================================================================

/**
 * Validates post-visit AI response and enforces strict medication integrity against doctor's prescription
 */
function validatePostVisitSummaryResponse(data, authoritativePrescriptionItems = []) {
  if (!data || typeof data !== 'object') {
    throw new Error('Post-visit AI response is not a valid JSON object.');
  }

  const summary = String(data.summary || '').trim();
  if (!summary) {
    throw new Error('Post-visit AI response missing required summary field.');
  }

  const diagnosisExplanation = String(data.diagnosis_explanation || '').trim();

  // Medication Integrity: Every medication in AI response must correspond to an actual prescription item
  // To avoid AI hallucinations, we normalize and map strictly to the doctor's prescribed items
  const validMedications = authoritativePrescriptionItems.map((item) => ({
    name: item.medication_name,
    strength: item.strength || '',
    dosage: item.dosage || '1 dose',
    frequency: item.frequency || 'As directed',
    route: item.route || 'Oral',
    duration: item.duration || 'As directed',
    instructions: item.instructions || 'Take as instructed by physician',
  }));

  const followUp = {
    instructions: data.follow_up?.instructions ? String(data.follow_up.instructions).trim() : 'Follow up as advised by your physician.',
    date: data.follow_up?.date ? String(data.follow_up.date).trim() : null,
  };

  return {
    summary,
    diagnosis_explanation: diagnosisExplanation || 'Your physician assessed your condition and outlined a personalized care plan.',
    medications: validMedications,
    follow_up: followUp,
  };
}

export function isPlaceholderDiagnosis(diag) {
  if (!diag || typeof diag !== 'string') return true;
  const trimmed = diag.trim().toLowerCase();
  const placeholders = [
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
  return placeholders.includes(trimmed);
}

/**
 * Deterministic Post-Visit Care Plan Generator Fallback
 */
function generateDeterministicPostVisitFallback(consultation, prescriptionItems = []) {
  const rawDiag = consultation.diagnosis?.trim();
  const hasRealDiagnosis = !isPlaceholderDiagnosis(rawDiag);
  const diagnosis = hasRealDiagnosis ? rawDiag : null;

  const notes = consultation.treatment_plan?.trim() || consultation.doctor_notes?.trim() || 'Follow prescribed care regimen and monitor symptoms.';
  const followUpInstr = consultation.follow_up_instructions?.trim() || 'Follow up with your physician if symptoms persist or worsen.';
  const followUpDate = consultation.follow_up_date || null;

  const medCount = prescriptionItems.length;
  const medSentence = medCount > 0
    ? `Your physician prescribed ${medCount} medication${medCount > 1 ? 's' : ''} to manage your condition.`
    : 'No medications were prescribed during this consultation.';

  const summary = hasRealDiagnosis
    ? `During your consultation, your physician recorded the clinical assessment: "${diagnosis}". ${medSentence} Clinical Care Plan: ${notes}`
    : `During your consultation, your physician recorded your treatment plan and medication instructions. ${medSentence} Care Plan: ${notes}`;

  const diagnosisExplanation = hasRealDiagnosis
    ? `Your physician recorded a diagnosis of "${diagnosis}". Please review your prescribed medications and instructions below.`
    : 'Diagnosis was not specified by the physician for this consultation.';

  const medications = prescriptionItems.map((item) => ({
    name: item.medication_name,
    strength: item.strength || '',
    dosage: item.dosage || '1 dose',
    frequency: item.frequency || 'As directed',
    route: item.route || 'Oral (PO)',
    duration: item.duration || 'As prescribed',
    instructions: item.instructions || 'Take as directed by doctor',
  }));

  return {
    summary,
    diagnosis_explanation: diagnosisExplanation,
    medications,
    follow_up: {
      instructions: followUpInstr,
      date: followUpDate,
    },
    model_used: 'clinical-rules-postvisit-v1',
  };
}


/**
 * Main AI Service Method: generatePostVisitSummary
 */
export async function generatePostVisitSummary(consultation, prescriptionItems = []) {
  if (!consultation) {
    throw new Error('Finalized consultation record is required to generate post-visit summary.');
  }

  const medListStr = prescriptionItems.length > 0
    ? prescriptionItems.map((m) => `- ${m.medication_name} ${m.strength ? `(${m.strength})` : ''}: Dosage: ${m.dosage}, Frequency: ${m.frequency}, Route: ${m.route || 'Oral (PO)'}, Duration: ${m.duration}. Instructions: ${m.instructions || 'Take as instructed'}`).join('\n')
    : 'No medications were prescribed for this consultation.';


  const promptText = `
DOCTOR'S FINALIZED CLINICAL RECORD:
Diagnosis / Assessment: ${consultation.diagnosis || 'Clinical Checkup'}
Doctor's Notes & Observations: ${consultation.doctor_notes || 'None'}
Treatment Plan: ${consultation.treatment_plan || 'None'}
Follow-up Instructions: ${consultation.follow_up_instructions || 'None'}
Follow-up Date: ${consultation.follow_up_date || 'None'}

PRESCRIBED MEDICATIONS (AUTHORITATIVE):
${medListStr}
`.trim();

  // 1. OpenAI
  if (config.ai.openaiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a compassionate medical communicator for MedSync clinic.
Convert the doctor's clinical notes into a clear, comforting, patient-friendly visit summary.

STRICT SAFETY & CLINICAL RULES:
1. The doctor's diagnosis and notes are 100% authoritative. Do NOT alter the diagnosis.
2. Do NOT add new medical advice or prescribe extra medicines.
3. Use plain, easy-to-understand language suitable for a patient.
4. Follow-up steps must come directly from the doctor's instructions.
5. Return a valid JSON object with:
   - "summary": string (warm, clear explanation of today's visit)
   - "diagnosis_explanation": string (simple explanation of the doctor's diagnosis)
   - "follow_up": { "instructions": string, "date": string or null }`,
            },
            {
              role: 'user',
              content: promptText,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 500,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const parsed = JSON.parse(result.choices?.[0]?.message?.content);
        const validated = validatePostVisitSummaryResponse(parsed, prescriptionItems);
        return { ...validated, model_used: result.model || 'gpt-4o-mini' };
      }
    } catch (err) {
      console.warn('OpenAI post-visit call failed, falling back:', err.message);
    }
  }

  // 2. Gemini
  if (config.ai.geminiApiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.ai.geminiApiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Convert these clinical notes into a patient-friendly summary with follow-up steps.
${promptText}

Respond ONLY in valid JSON with keys: "summary", "diagnosis_explanation", "follow_up" ({ "instructions", "date" }).`,
              }],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(rawText);
        const validated = validatePostVisitSummaryResponse(parsed, prescriptionItems);
        return { ...validated, model_used: 'gemini-1.5-flash' };
      }
    } catch (err) {
      console.warn('Gemini post-visit call failed, falling back:', err.message);
    }
  }

  return generateDeterministicPostVisitFallback(consultation, prescriptionItems);
}
