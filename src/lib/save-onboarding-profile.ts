import { supabase } from '@/lib/supabase'
import type { PromptResponses } from '@/types/database'

export interface OnboardingProfileMeta {
  displayName?: string
  avatarUrl?: string | null
}

/** Save onboarding answers directly via Supabase RLS — no API route required. */
export async function saveOnboardingProfileClient(
  userId: string,
  promptResponses: PromptResponses,
  profileMeta?: OnboardingProfileMeta
): Promise<{ success: boolean; error?: string }> {
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: profileMeta?.displayName ?? undefined,
      avatar_url: profileMeta?.avatarUrl ?? undefined,
      prompt_responses: promptResponses,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    console.error('Client profile save failed:', profileError)
    return { success: false, error: profileError.message }
  }

  const { error: threadError } = await supabase.from('conversation_threads').insert({
    user_id: userId,
    thread_type: 'onboarding',
    messages: promptResponses as unknown as Record<string, string>,
  })

  if (threadError) {
    console.error('Client thread save failed:', threadError)
    return { success: false, error: threadError.message }
  }

  return { success: true }
}
