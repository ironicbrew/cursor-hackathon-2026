import {
  buildPipelineResult,
  formatUnknownError,
  type PipelineResult,
  type StepResult,
} from './errors'
import {
  createMatchPairIfNew,
  fetchAllOtherProfiles,
  type MatchProfile,
} from './matching'
import { getSupabaseAdmin, getSupabaseForUser, isInvalidApiKeyError } from './supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PromptResponses {
  currentFocus: string
  lookingFor: string
  canOffer: string
  location: string
}

export interface ProfileMeta {
  displayName?: string
  avatarUrl?: string | null
}

function failStep(step: string, error: unknown, source: 'supabase' | 'openai' | 'internal' = 'internal'): StepResult {
  return { step, ok: false, error: formatUnknownError(error, source) }
}

function okStep(step: string, data?: Record<string, unknown>): StepResult {
  return { step, ok: true, data }
}

/** Upsert profiles row via service role, or signed-in user session as fallback. */
async function ensureUserProfileWithClient(
  client: SupabaseClient,
  userId: string,
  meta?: ProfileMeta
): Promise<PipelineResult> {
  const steps: StepResult[] = []

  const { data: existing, error: fetchError } = await client
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (fetchError) {
    console.error('ensure_profile fetch failed:', JSON.stringify(fetchError, null, 2))
    steps.push(failStep('ensure_profile', fetchError, 'supabase'))
    return buildPipelineResult(userId, steps)
  }

  if (!existing) {
    const { error: insertError } = await client.from('profiles').insert({
      id: userId,
      display_name: meta?.displayName || 'User',
      avatar_url: meta?.avatarUrl ?? null,
    })

    if (insertError) {
      console.error('ensure_profile insert failed:', JSON.stringify(insertError, null, 2))
      steps.push(failStep('ensure_profile', insertError, 'supabase'))
      return buildPipelineResult(userId, steps)
    }

    steps.push(okStep('ensure_profile', { action: 'insert', display_name: meta?.displayName || 'User' }))
    return buildPipelineResult(userId, steps)
  }

  const updates: { display_name?: string; avatar_url?: string | null; updated_at?: string } = {}
  if (meta?.displayName && meta.displayName !== 'User' && !existing.display_name) {
    updates.display_name = meta.displayName
  }
  if (meta?.avatarUrl && !existing.avatar_url) {
    updates.avatar_url = meta.avatarUrl
  }

  if (Object.keys(updates).length === 0) {
    steps.push(okStep('ensure_profile', { action: 'exists', display_name: existing.display_name }))
    return buildPipelineResult(userId, steps)
  }

  updates.updated_at = new Date().toISOString()
  const { error: updateError } = await client.from('profiles').update(updates).eq('id', userId)

  if (updateError) {
    steps.push(failStep('ensure_profile', updateError, 'supabase'))
    return buildPipelineResult(userId, steps)
  }

  steps.push(okStep('ensure_profile', { action: 'update', ...updates }))
  return buildPipelineResult(userId, steps)
}

export async function ensureUserProfile(
  userId: string,
  meta?: ProfileMeta,
  accessToken?: string
): Promise<PipelineResult> {
  let adminResult: PipelineResult

  try {
    adminResult = await ensureUserProfileWithClient(getSupabaseAdmin(), userId, meta)
  } catch (error) {
    adminResult = {
      success: false,
      userId,
      steps: [failStep('ensure_profile', error, 'internal')],
      summary: `Failed at "ensure_profile": ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const adminFailed = adminResult.steps.find(s => s.step === 'ensure_profile' && !s.ok)
  if (!adminFailed || !accessToken || !isInvalidApiKeyError(adminFailed.error)) {
    return adminResult
  }

  console.warn('Service role key rejected; falling back to user session for ensure_profile')
  const sessionResult = await ensureUserProfileWithClient(getSupabaseForUser(accessToken), userId, meta)

  if (sessionResult.success) {
    sessionResult.steps.unshift(
      okStep('ensure_profile_auth', {
        mode: 'user_session_fallback',
        hint: 'Fix SUPABASE_SERVICE_ROLE_KEY in .env for server-side matching (Supabase → Settings → API → Secret keys).',
      })
    )
  }

  return sessionResult
}

export async function runProfileIngested(
  userId: string,
  promptResponses: PromptResponses,
  profileMeta?: ProfileMeta
): Promise<PipelineResult> {
  const steps: StepResult[] = []
  const supabaseAdmin = getSupabaseAdmin()

  const ensureResult = await ensureUserProfile(userId, profileMeta)
  steps.push(...ensureResult.steps)
  if (!ensureResult.success) {
    return buildPipelineResult(userId, steps)
  }

  const { error: threadError } = await supabaseAdmin.from('conversation_threads').insert({
    user_id: userId,
    thread_type: 'onboarding',
    messages: promptResponses,
  })

  if (threadError) {
    steps.push(failStep('save_conversation_thread', threadError, 'supabase'))
    return buildPipelineResult(userId, steps)
  }

  steps.push(okStep('save_conversation_thread', { userId }))

  const { error: saveError } = await supabaseAdmin
    .from('profiles')
    .update({
      prompt_responses: promptResponses,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (saveError) {
    steps.push(failStep('save_prompt_responses', saveError, 'supabase'))
    return buildPipelineResult(userId, steps)
  }

  steps.push(okStep('save_prompt_responses', { userId }))

  const textToEmbed = [
    promptResponses.currentFocus,
    `Looking for: ${promptResponses.lookingFor}`,
    `Can offer: ${promptResponses.canOffer}`,
    `Location: ${promptResponses.location}`,
  ].join(' | ')

  let embedding: number[] | undefined

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      steps.push(
        failStep('generate_embedding', {
          message: result.error?.message || 'OpenAI embeddings request failed',
        }, 'openai')
      )
      return buildPipelineResult(userId, steps)
    }

    embedding = result.data?.[0]?.embedding
    if (!embedding) {
      steps.push(failStep('generate_embedding', { message: 'No embedding returned from OpenAI' }, 'openai'))
      return buildPipelineResult(userId, steps)
    }

    steps.push(okStep('generate_embedding', { dimensions: embedding.length, model: 'text-embedding-3-small' }))
  } catch (error) {
    steps.push(failStep('generate_embedding', error, 'openai'))
    return buildPipelineResult(userId, steps)
  }

  const { error: embedError } = await supabaseAdmin
    .from('profiles')
    .update({ embedding, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (embedError) {
    steps.push(failStep('save_embedding', embedError, 'supabase'))
    return buildPipelineResult(userId, steps)
  }

  steps.push(okStep('save_embedding', { userId }))

  const matchingResult = await runMatching(userId)
  steps.push(...matchingResult.steps)

  return buildPipelineResult(userId, steps)
}

export async function runMatching(triggeredBy: string): Promise<PipelineResult> {
  const steps: StepResult[] = []
  const supabaseAdmin = getSupabaseAdmin()

  const { data: selfProfile, error: selfError } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, prompt_responses')
    .eq('id', triggeredBy)
    .single()

  if (selfError || !selfProfile) {
    steps.push(failStep('load_self_profile', selfError ?? 'Profile not found', 'supabase'))
    return buildPipelineResult(triggeredBy, steps)
  }

  const { profiles: otherProfiles, error: listError } = await fetchAllOtherProfiles(
    supabaseAdmin,
    triggeredBy
  )

  if (listError) {
    steps.push(failStep('list_all_profiles', listError, 'supabase'))
    return buildPipelineResult(triggeredBy, steps)
  }

  steps.push(okStep('list_all_profiles', { count: otherProfiles.length }))

  if (otherProfiles.length === 0) {
    steps.push(okStep('create_match_suggestions', { matchesCreated: 0 }))
    return buildPipelineResult(triggeredBy, steps)
  }

  let matchesCreated = 0
  const matchErrors: StepResult[] = []

  for (const other of otherProfiles) {
    const result = await createMatchPairIfNew(
      supabaseAdmin,
      triggeredBy,
      other.id,
      selfProfile as MatchProfile,
      other
    )

    if (result.error) {
      matchErrors.push(failStep(`create_match:${other.id}`, result.error, 'supabase'))
      continue
    }

    if (result.created) {
      matchesCreated++
    }
  }

  steps.push(
    okStep('create_match_suggestions', {
      matchesCreated,
      totalProfiles: otherProfiles.length,
      errors: matchErrors.length > 0 ? matchErrors : undefined,
    })
  )

  return buildPipelineResult(triggeredBy, steps)
}

export async function runDevEvent(name: string, data: Record<string, unknown>): Promise<PipelineResult> {
  if (name === 'user/profile.ensure') {
    const { userId, profileMeta, accessToken } = data as {
      userId: string
      profileMeta?: ProfileMeta
      accessToken?: string
    }
    const profileResult = await ensureUserProfile(userId, profileMeta, accessToken)
    if (!profileResult.success) return profileResult

    let matchingResult: PipelineResult
    try {
      matchingResult = await runMatching(userId)
    } catch (error) {
      matchingResult = {
        success: false,
        userId,
        steps: [failStep('run_matching', error, 'internal')],
        summary: `Failed at "run_matching": ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const matchingFailed = matchingResult.steps.find(s => !s.ok)
    if (!matchingResult.success && matchingFailed && isInvalidApiKeyError(matchingFailed.error)) {
      return {
        success: true,
        userId,
        steps: [
          ...profileResult.steps,
          ...matchingResult.steps,
          okStep('run_matching', {
            skipped: true,
            reason: 'invalid_service_role_key',
          }),
        ],
        summary: `${profileResult.summary} (matching skipped — fix SUPABASE_SERVICE_ROLE_KEY)`,
      }
    }

    return {
      success: profileResult.success && matchingResult.success,
      userId,
      steps: [...profileResult.steps, ...matchingResult.steps],
      summary: matchingResult.success
        ? `${profileResult.summary} → ${matchingResult.summary}`
        : profileResult.summary,
    }
  }

  if (name === 'user/profile.ingested') {
    const { userId, promptResponses, profileMeta } = data as {
      userId: string
      promptResponses: PromptResponses
      profileMeta?: ProfileMeta
    }
    return runProfileIngested(userId, promptResponses, profileMeta)
  }

  if (name === 'matching/run') {
    const { triggeredBy } = data as { triggeredBy: string }
    return runMatching(triggeredBy)
  }

  throw new Error(`No dev fallback handler for event: ${name}`)
}
