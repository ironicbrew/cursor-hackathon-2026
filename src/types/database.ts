export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface PromptResponses {
  currentFocus: string
  lookingFor: string
  canOffer: string
  location: string
}

export interface MatchRationale {
  why: string
  suggested_message?: string
  common_ground: string[]
  conversation_starters: string[]
  networking_tips: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          prompt_responses: PromptResponses | null
          embedding: number[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          prompt_responses?: PromptResponses | null
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          prompt_responses?: PromptResponses | null
          embedding?: number[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_suggestions: {
        Row: {
          id: string
          recipient_id: string
          matched_user_id: string
          rationale: MatchRationale
          status: 'new' | 'accepted' | 'declined'
          created_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          matched_user_id: string
          rationale: MatchRationale | Json
          status?: 'new' | 'accepted' | 'declined'
          created_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          matched_user_id?: string
          rationale?: MatchRationale | Json
          status?: 'new' | 'accepted' | 'declined'
          created_at?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          id: string
          user_id: string
          thread_type: 'onboarding' | 'suggestion'
          messages: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          thread_type: 'onboarding' | 'suggestion'
          messages?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          thread_type?: 'onboarding' | 'suggestion'
          messages?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      find_similar_profiles: {
        Args: {
          target_user_id: string
          similarity_threshold?: number
          max_results?: number
        }
        Returns: {
          user_id: string
          display_name: string
          similarity: number
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type MatchSuggestion = Database['public']['Tables']['match_suggestions']['Row']
export type ConversationThread = Database['public']['Tables']['conversation_threads']['Row']
