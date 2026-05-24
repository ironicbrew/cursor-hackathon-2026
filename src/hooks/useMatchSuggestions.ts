import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/api-errors'
import {
  buildTemplateRationale,
  ensureMinConversationStarters,
  ensureMinNetworkingTips,
} from '@/lib/match-rationale'
import type { MatchRationale, MatchSuggestion, Profile } from '@/types/database'

export interface SuggestionWithMatch extends MatchSuggestion {
  matched_profile?: Profile | null
}

type FetchResult =
  | { suggestions: SuggestionWithMatch[]; error: null }
  | { suggestions: []; error: ReturnType<typeof formatSupabaseError> }

async function fetchMatchSuggestions(userId: string): Promise<FetchResult> {
  const { data: viewerProfile, error: viewerError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (viewerError) {
    console.error('Error fetching viewer profile:', viewerError)
    return { suggestions: [], error: formatSupabaseError(viewerError) }
  }

  const { data: allProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', userId)
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
    return { suggestions: [], error: formatSupabaseError(profilesError) }
  }

  const { data: savedSuggestions, error: suggestionsError } = await supabase
    .from('match_suggestions')
    .select('*')
    .eq('recipient_id', userId)

  if (suggestionsError) {
    console.error('Error fetching match suggestions:', suggestionsError)
    return { suggestions: [], error: formatSupabaseError(suggestionsError) }
  }

  const savedByMatchId = new Map(
    (savedSuggestions ?? []).map(s => [s.matched_user_id, s])
  )

  const merged: SuggestionWithMatch[] = (allProfiles ?? []).map(profile => {
    const saved = savedByMatchId.get(profile.id)

    if (saved) {
      const rationale = saved.rationale as MatchRationale
      return {
        ...saved,
        rationale: {
          ...rationale,
          conversation_starters: ensureMinConversationStarters(
            rationale.conversation_starters,
            viewerProfile,
            profile,
            rationale.suggested_message
          ),
          networking_tips: ensureMinNetworkingTips(
            rationale.networking_tips,
            viewerProfile,
            profile
          ),
        },
        matched_profile: profile,
      }
    }

    const rationale = buildTemplateRationale(viewerProfile, profile)

    return {
      id: `synthetic-${profile.id}`,
      recipient_id: userId,
      matched_user_id: profile.id,
      rationale,
      status: 'new',
      created_at: profile.created_at,
      matched_profile: profile,
    }
  })

  merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return { suggestions: merged, error: null }
}

export function useMatchSuggestions(userId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionWithMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ReturnType<typeof formatSupabaseError> | null>(null)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    void (async () => {
      setLoading(true)
      const result = await fetchMatchSuggestions(userId)
      if (cancelled) return

      if (result.error) {
        setError(result.error)
        setSuggestions([])
      } else {
        setError(null)
        setSuggestions(result.suggestions)
      }
      setLoading(false)
    })()

    const channel = supabase
      .channel('inbox_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_suggestions',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void (async () => {
            const result = await fetchMatchSuggestions(userId)
            if (cancelled) return

            if (result.error) {
              setError(result.error)
            } else {
              setError(null)
              setSuggestions(result.suggestions)
            }
          })()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  return {
    suggestions: userId ? suggestions : [],
    loading: userId ? loading : false,
    error: userId ? error : null,
  }
}
