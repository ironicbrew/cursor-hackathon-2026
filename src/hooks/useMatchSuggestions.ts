import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/api-errors'
import {
  buildTemplateRationale,
  readLocalMatchStatus,
  writeLocalMatchStatus,
} from '@/lib/match-rationale'
import type { MatchSuggestion, Profile } from '@/types/database'

export interface SuggestionWithMatch extends MatchSuggestion {
  matched_profile?: Profile | null
  synthetic?: boolean
}

export function useMatchSuggestions(userId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionWithMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ReturnType<typeof formatSupabaseError> | null>(null)

  const fetchSuggestions = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    const { data: viewerProfile, error: viewerError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (viewerError) {
      console.error('Error fetching viewer profile:', viewerError)
      setError(formatSupabaseError(viewerError))
      setLoading(false)
      return
    }

    const { data: allProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', userId)
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      setError(formatSupabaseError(profilesError))
      setLoading(false)
      return
    }

    const { data: savedSuggestions, error: suggestionsError } = await supabase
      .from('match_suggestions')
      .select('*')
      .eq('recipient_id', userId)

    if (suggestionsError) {
      console.error('Error fetching match suggestions:', suggestionsError)
      setError(formatSupabaseError(suggestionsError))
      setLoading(false)
      return
    }

    setError(null)

    const savedByMatchId = new Map(
      (savedSuggestions ?? []).map(s => [s.matched_user_id, s])
    )
    const localStatus = readLocalMatchStatus(userId)

    const merged: SuggestionWithMatch[] = (allProfiles ?? []).map(profile => {
      const saved = savedByMatchId.get(profile.id)

      if (saved) {
        return {
          ...saved,
          matched_profile: profile,
          synthetic: false,
        }
      }

      const rationale = buildTemplateRationale(viewerProfile, profile)
      const status = localStatus[profile.id] ?? 'new'

      return {
        id: `synthetic-${profile.id}`,
        recipient_id: userId,
        matched_user_id: profile.id,
        rationale,
        status,
        created_at: profile.created_at,
        matched_profile: profile,
        synthetic: true,
      }
    })

    merged.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    setSuggestions(merged)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchSuggestions()

    if (!userId) return

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
          fetchSuggestions()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, fetchSuggestions])

  const updateSuggestionStatus = async (
    suggestionId: string,
    status: 'accepted' | 'declined'
  ) => {
    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion || !userId) return

    if (suggestion.synthetic) {
      writeLocalMatchStatus(userId, suggestion.matched_user_id, status)
      setSuggestions(prev =>
        prev.map(s => (s.id === suggestionId ? { ...s, status } : s))
      )
      return
    }

    const { error: updateError } = await supabase
      .from('match_suggestions')
      .update({ status })
      .eq('id', suggestionId)

    if (updateError) throw updateError

    await fetchSuggestions()
  }

  return {
    suggestions,
    loading,
    error,
    updateSuggestionStatus,
    refetch: fetchSuggestions,
  }
}
