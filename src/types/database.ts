export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          linkedin_subject: string | null
          display_name: string | null
          headline: string | null
          location: string | null
          avatar_url: string | null
          ingestion_status: 'pending' | 'complete' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          linkedin_subject?: string | null
          display_name?: string | null
          headline?: string | null
          location?: string | null
          avatar_url?: string | null
          ingestion_status?: 'pending' | 'complete' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          linkedin_subject?: string | null
          display_name?: string | null
          headline?: string | null
          location?: string | null
          avatar_url?: string | null
          ingestion_status?: 'pending' | 'complete' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_snapshots: {
        Row: {
          id: string
          user_id: string
          snapshot_json: Json
          fetched_at: string
          api_version: string
        }
        Insert: {
          id?: string
          user_id: string
          snapshot_json: Json
          fetched_at?: string
          api_version?: string
        }
        Update: {
          id?: string
          user_id?: string
          snapshot_json?: Json
          fetched_at?: string
          api_version?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          id: string
          user_id: string
          thread_type: 'onboarding' | 'suggestion'
          messages: Json
          related_suggestion_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          thread_type: 'onboarding' | 'suggestion'
          messages?: Json
          related_suggestion_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          thread_type?: 'onboarding' | 'suggestion'
          messages?: Json
          related_suggestion_id?: string | null
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
          rationale: Json
          status: 'new' | 'accepted' | 'declined'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          recipient_id: string
          matched_user_id: string
          rationale: Json
          status?: 'new' | 'accepted' | 'declined'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          recipient_id?: string
          matched_user_id?: string
          rationale?: Json
          status?: 'new' | 'accepted' | 'declined'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      suggestion_feedback: {
        Row: {
          id: string
          suggestion_id: string
          feedback_type: 'accept' | 'decline'
          reason_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          suggestion_id: string
          feedback_type: 'accept' | 'decline'
          reason_text?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          suggestion_id?: string
          feedback_type?: 'accept' | 'decline'
          reason_text?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type MatchSuggestion = Database['public']['Tables']['match_suggestions']['Row']
export type ConversationThread = Database['public']['Tables']['conversation_threads']['Row']
