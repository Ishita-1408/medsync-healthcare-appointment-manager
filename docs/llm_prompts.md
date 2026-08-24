# MedSync LLM & AI Clinical Prompts Documentation

## 1. Pre-Visit Symptom Summary & Triage Assistant

### Purpose
To assist the physician before an encounter by extracting the core chief complaint, estimating administrative triage urgency, and formulating three relevant clinical history questions based on the patient's submitted symptom intake.

### Input Data
Structured intake payload passed from `public.appointment_intakes`:
- `chief_complaint` (string)
- `symptoms` (string)
- `symptom_onset` (string)
- `severity` (MILD | MODERATE | SEVERE | CRITICAL)
- `progression` (BETTER | SAME | WORSE | FLUCTUATING)
- `current_medications` (string)
- `allergies` (string)
- `existing_conditions` (string)

### System Prompt
```text
You are an administrative medical assistant in a healthcare clinic helping the doctor prepare before meeting the patient.

SAFETY & CLINICAL RULES:
1. Do NOT diagnose the patient.
2. Do NOT recommend treatments or prescribe medications.
3. Do NOT invent symptoms not mentioned in the intake.
4. Extract the chief complaint concisely.
5. Determine administrative triage urgency as: "Low", "Medium", or "High".
6. Provide exactly 3 clinical history questions for the doctor to ask the patient.
7. Return ONLY a valid JSON object with keys: "urgency", "chief_complaint", "suggested_questions" (array of 3 strings).
```

### User Prompt
```text
"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor.

Chief Complaint: {chief_complaint}
Symptoms: {symptoms}
Onset: {symptom_onset}
Reported Severity: {severity}
Medications: {current_medications}
Allergies: {allergies}"
```

### Output JSON Schema
```json
{
  "urgency": "Low | Medium | High",
  "chief_complaint": "string",
  "suggested_questions": [
    "string",
    "string",
    "string"
  ]
}
```

---

## 2. Post-Visit Patient-Friendly Summary & Medication Schedule

### Purpose
To translate the physician's finalized clinical encounter notes, recorded diagnosis, and prescribed medications into compassionate, easy-to-understand language for the patient, complete with a structured medication schedule and follow-up guidance.

### Input Data
- Finalized record from `public.consultation_notes`:
  - `diagnosis` (string)
  - `doctor_notes` (string)
  - `treatment_plan` (string)
  - `follow_up_instructions` (string)
  - `follow_up_date` (string / ISO date)
- Authoritative medications from `public.prescription_items`:
  - `medication_name`, `strength`, `dosage`, `frequency`, `route`, `duration`, `instructions`

### System Prompt
```text
You are a compassionate medical communicator for MedSync clinic.
Convert the doctor's clinical notes into a clear, comforting, patient-friendly visit summary.

STRICT SAFETY & CLINICAL RULES:
1. The doctor's diagnosis and notes are 100% authoritative. Do NOT alter the diagnosis.
2. Do NOT add new medical advice or prescribe extra medicines.
3. Use plain, easy-to-understand language suitable for a patient.
4. Follow-up steps must come directly from the doctor's instructions.
5. Return a valid JSON object with:
   - "summary": string (warm, clear explanation of today's visit)
   - "diagnosis_explanation": string (simple explanation of the doctor's diagnosis)
   - "follow_up": { "instructions": string, "date": string or null }
```

### User Prompt
```text
"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps:

DOCTOR'S FINALIZED CLINICAL RECORD:
Diagnosis: {diagnosis}
Doctor Notes: {doctor_notes}
Treatment Plan: {treatment_plan}
Follow-up: {follow_up_instructions}
Follow-up Date: {follow_up_date}

PRESCRIBED MEDICATIONS (AUTHORITATIVE):
{medication_list}"
```

### Output JSON Schema
```json
{
  "summary": "During your consultation today, Dr. Smith assessed your symptoms...",
  "diagnosis_explanation": "You were diagnosed with Acute Bronchitis, which is an inflammation of the airways...",
  "medications": [
    {
      "name": "Amoxicillin",
      "strength": "500mg",
      "dosage": "1 capsule",
      "frequency": "Three times daily",
      "route": "Oral",
      "duration": "7 days",
      "instructions": "Take with meals and complete the entire course"
    }
  ],
  "follow_up": {
    "instructions": "Drink plenty of fluids and rest. Follow up if fever exceeds 101°F after 3 days.",
    "date": "2026-09-01"
  }
}
```

### Medication Integrity & Safety Guardrails
- **Zero-Hallucination Medication Guarantee**: Every medication item returned to the patient is strictly mapped against and verified with the physician's authoritative `prescription_items` database rows.
- **Patient Notice**: Displayed prominently: *"AI-generated patient-friendly summary based on your doctor's finalized consultation. It does not replace your doctor's medical advice."*
- **Offline Fallback**: If LLM services are temporarily offline or unconfigured, MedSync utilizes a deterministic clinical summarizer to ensure patients always have access to a clean summary of their care plan.
