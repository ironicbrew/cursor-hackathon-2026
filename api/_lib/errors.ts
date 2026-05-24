import type { PostgrestError } from '@supabase/supabase-js'

export interface DiagnosisError {
  message: string
  code?: string
  details?: string
  hint?: string
  source: 'supabase' | 'openai' | 'inngest' | 'internal'
}

export interface StepResult {
  step: string
  ok: boolean
  error?: DiagnosisError
  data?: Record<string, unknown>
}

export interface PipelineResult {
  success: boolean
  userId?: string
  steps: StepResult[]
  summary: string
}

/** Coerce Supabase/PostgREST errors (message is sometimes a nested object) to readable text. */
export function normalizeErrorMessage(value: unknown): string {
  if (value == null) return 'Unknown error'

  if (typeof value === 'string') return value

  if (value instanceof Error) return value.message

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>

    if (typeof obj.message === 'string') return obj.message

    if (obj.message != null && typeof obj.message !== 'string') {
      const nested = normalizeErrorMessage(obj.message)
      if (nested !== 'Unknown error') return nested
    }

    if (typeof obj.error === 'string') return obj.error
    if (typeof obj.error_description === 'string') return obj.error_description

    if (typeof obj.details === 'string' && obj.details.length > 0) return obj.details
    if (typeof obj.hint === 'string' && obj.hint.length > 0) return obj.hint

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'details' in error || 'hint' in error)
  )
}

export function formatSupabaseError(error: PostgrestError | Record<string, unknown>): DiagnosisError {
  const message = normalizeErrorMessage(error)
  const record = error as Record<string, unknown>

  const diagnosis: DiagnosisError = {
    message,
    code: typeof record.code === 'string' ? record.code : undefined,
    details: typeof record.details === 'string' ? record.details : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
    source: 'supabase',
  }

  if (message.includes('Invalid API key')) {
    diagnosis.hint =
      'Check SUPABASE_SERVICE_ROLE_KEY in .env — use the service_role secret from Supabase → Project Settings → API (long JWT starting with eyJ). Restart vercel dev after updating .env.'
  }

  if (message.includes('relation') && message.includes('does not exist')) {
    diagnosis.hint = 'Run supabase/schema.sql in the Supabase SQL Editor to create the profiles table.'
  }

  return diagnosis
}

export function formatUnknownError(error: unknown, source: DiagnosisError['source'] = 'internal'): DiagnosisError {
  if (isPostgrestError(error)) {
    return formatSupabaseError(error)
  }

  if (error instanceof Error) {
    return { message: error.message, source }
  }

  return { message: normalizeErrorMessage(error), source }
}

export function buildPipelineResult(
  userId: string | undefined,
  steps: StepResult[]
): PipelineResult {
  const failed = steps.find(s => !s.ok)
  const success = !failed

  const completed = steps.filter(s => s.ok).map(s => s.step)
  const summary = success
    ? `Completed: ${completed.join(' → ')}`
    : `Failed at "${failed!.step}": ${failed!.error?.message ?? 'Unknown error'}`

  return { success, userId, steps, summary }
}

export function toErrorResponse(error: unknown, step?: string) {
  const diagnosis = formatUnknownError(error)
  const status = diagnosis.source === 'supabase' ? 422 : 500

  return {
    status,
    body: {
      success: false,
      step,
      error: diagnosis.message,
      supabase:
        diagnosis.source === 'supabase'
          ? {
              code: diagnosis.code,
              message: diagnosis.message,
              details: diagnosis.details,
              hint: diagnosis.hint,
            }
          : undefined,
      diagnosis,
    },
  }
}
