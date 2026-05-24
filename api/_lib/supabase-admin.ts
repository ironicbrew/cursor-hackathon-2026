import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

function projectUrl(): string | undefined {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.replace(/\/$/, '')
}

function publishableKey(): string | undefined {
  return process.env.VITE_SUPABASE_ANON_KEY?.trim()
}

/** Service-role Supabase client for API/Inngest. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = projectUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return adminClient
}

/** Authenticated client using the user's access token (RLS applies). */
export function getSupabaseForUser(accessToken: string): SupabaseClient {
  const url = projectUrl()
  const key = publishableKey()

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export function isInvalidApiKeyError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message).includes('Invalid API key')
  }
  return false
}
