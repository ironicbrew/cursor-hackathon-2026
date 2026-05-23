import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MatchSuggestion, Profile } from '@/types/database'

interface SuggestionWithMatch extends MatchSuggestion {
  matched_profile?: Profile | null
}

export function useMatchSuggestions(userId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionWithMatch[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSuggestions = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // Fetch suggestions first
    const { data: suggestionsData, error: suggestionsError } = await supabase
      .from('match_suggestions')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })

    if (suggestionsError) {
      console.error('Error fetching suggestions:', suggestionsError)
      setLoading(false)
      return
    }

    if (!suggestionsData || suggestionsData.length === 0) {
      setSuggestions([])
      setLoading(false)
      return
    }

    // Fetch matched profiles separately
    const matchedUserIds = suggestionsData.map(s => s.matched_user_id)
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .in('id', matchedUserIds)

    // Combine suggestions with profiles
    const suggestionsWithProfiles = suggestionsData.map(suggestion => ({
      ...suggestion,
      matched_profile: profilesData?.find(p => p.id === suggestion.matched_user_id) || null,
    }))

    setSuggestions(suggestionsWithProfiles)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchSuggestions()

    if (!userId) return

    const channel = supabase
      .channel('match_suggestions_changes')
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
    updateSuggestionStatus,
    refetch: fetchSuggestions,
  }
}
