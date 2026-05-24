import type { PostgrestError } from '@supabase/supabase-js'

export interface DiagnosisError {
  message: string
  code?: string
  details?: string
  hint?: string
  source?: string
}

export interface StepResult {
  step: string
  ok: boolean
  error?: DiagnosisError
  data?: Record<string, unknown>
}

export interface SendEventResponse {
  success: boolean
  mode?: string
  summary?: string
  userId?: string
  step?: string
  error?: string
  supabase?: {
    code?: string
    message?: string
    details?: string
    hint?: string
  }
  diagnosis?: DiagnosisError
  steps?: StepResult[]
  hint?: string
}

function displayErrorMessage(result: SendEventResponse): string | null {
  const candidates = [
    result.error,
    result.diagnosis?.message,
    result.supabase?.message,
    result.steps?.find(s => !s.ok)?.error?.message,
    result.summary,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0 && candidate !== '[object Object]') {
      return candidate
    }
  }

  return null
}

export function formatSupabaseError(error: PostgrestError): DiagnosisError {
  const message =
    typeof error.message === 'string' ? error.message : JSON.stringify(error.message ?? error)

  return {
    message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    source: 'supabase',
  }
}

export function formatDiagnosisMessage(result: SendEventResponse): string {
  if (!result.success) {
    const message = displayErrorMessage(result)
    const failedStep = result.steps?.find(s => !s.ok)

    const parts = [
      `Something went wrong during setup.`,
      result.step ? `Failed step: ${result.step}` : null,
      message ? `Error: ${message}` : null,
      result.supabase?.hint ?? failedStep?.error?.hint
        ? `Hint: ${result.supabase?.hint ?? failedStep?.error?.hint}`
        : null,
      result.supabase?.details ? `Details: ${result.supabase.details}` : null,
      result.supabase?.code ? `Code: ${result.supabase.code}` : null,
    ].filter(Boolean)
    return parts.join('\n')
  }

  const stepLines =
    result.steps
      ?.filter(s => s.ok)
      .map(s => {
        const extra = s.data ? ` (${Object.entries(s.data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})` : ''
        return `✓ ${s.step}${extra}`
      })
      .join('\n') ?? ''

  return [result.summary ?? 'Profile setup completed.', stepLines].filter(Boolean).join('\n\n')
}
