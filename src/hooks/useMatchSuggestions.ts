import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MatchSuggestion, Profile } from '@/types/database'

interface SuggestionWithMatch extends MatchSuggestion {
  matched_profile?: Profile
}

export function useMatchSuggestions(userId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionWithMatch[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSuggestions = useCallback(async () => {
    if (!userId) return

    const { data, error } = await supabase
      .from('match_suggestions')
      .select('*, matched_profile:profiles!match_suggestions_matched_user_id_fkey(*)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching suggestions:', error)
      return
    }

    setSuggestions(data as unknown as SuggestionWithMatch[])
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
    status: 'accepted' | 'declined',
    reason?: string
  ) => {
    const { error: updateError } = await supabase
      .from('match_suggestions')
      .update({ status })
      .eq('id', suggestionId)

    if (updateError) throw updateError

    if (reason) {
      const { error: feedbackError } = await supabase
        .from('suggestion_feedback')
        .insert({
          suggestion_id: suggestionId,
          feedback_type: status === 'accepted' ? 'accept' : 'decline',
          reason_text: reason,
        })

      if (feedbackError) throw feedbackError
    }

    await fetchSuggestions()
  }

  return {
    suggestions,
    loading,
    updateSuggestionStatus,
    refetch: fetchSuggestions,
  }
}
