-- ===========================================
-- NETWORTH AI - SIMPLIFIED SCHEMA
-- Run this in Supabase SQL Editor to wipe and rebuild
-- ===========================================

-- Step 1: Drop existing tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS suggestion_feedback CASCADE;
DROP TABLE IF EXISTS conversation_threads CASCADE;
DROP TABLE IF EXISTS match_suggestions CASCADE;
DROP TABLE IF EXISTS user_embeddings CASCADE;
DROP TABLE IF EXISTS linkedin_snapshots CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Step 2: Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS upsert_user_embedding(uuid, vector);
DROP FUNCTION IF EXISTS match_users_by_embedding(uuid, uuid);

-- Step 3: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ===========================================
-- TABLE 1: profiles
-- Stores user info + embedding in one place
-- ===========================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  prompt_responses jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS profiles_embedding_idx 
  ON profiles USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- ===========================================
-- TABLE 2: match_suggestions
-- AI-generated match recommendations
-- ===========================================
CREATE TABLE match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  matched_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(recipient_id, matched_user_id)
);

-- ===========================================
-- TABLE 3: conversation_threads (optional)
-- For storing chat history
-- ===========================================
CREATE TABLE conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  thread_type text NOT NULL CHECK (thread_type IN ('onboarding', 'suggestion')),
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles 
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view other profiles for matching" ON profiles;
CREATE POLICY "Users can view other profiles for matching" ON profiles 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Match suggestions RLS
ALTER TABLE match_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their suggestions" ON match_suggestions;
CREATE POLICY "Users can view their suggestions" ON match_suggestions 
  FOR SELECT USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can update their suggestions" ON match_suggestions;
CREATE POLICY "Users can update their suggestions" ON match_suggestions 
  FOR UPDATE USING (auth.uid() = recipient_id);

-- Conversation threads RLS
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own threads" ON conversation_threads;
CREATE POLICY "Users can view own threads" ON conversation_threads 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own threads" ON conversation_threads;
CREATE POLICY "Users can insert own threads" ON conversation_threads 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- GRANTS
-- ===========================================
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON match_suggestions TO authenticated;
GRANT SELECT, INSERT ON conversation_threads TO authenticated;

-- ===========================================
-- TRIGGER: Auto-create profile on signup
-- ===========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===========================================
-- HELPER FUNCTION: Find similar profiles
-- ===========================================
CREATE OR REPLACE FUNCTION find_similar_profiles(
  target_user_id uuid,
  similarity_threshold float DEFAULT 0.5,
  max_results int DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    1 - (p.embedding <=> target.embedding) as similarity
  FROM profiles p
  CROSS JOIN (SELECT embedding FROM profiles WHERE id = target_user_id) target
  WHERE p.id != target_user_id
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> target.embedding) > similarity_threshold
  ORDER BY p.embedding <=> target.embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- REALTIME
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE match_suggestions;

-- ===========================================
-- VERIFICATION
-- ===========================================
DO $$
BEGIN
  RAISE NOTICE 'Schema created successfully!';
  RAISE NOTICE 'Tables: profiles, match_suggestions, conversation_threads';
  RAISE NOTICE 'Trigger: on_auth_user_created -> handle_new_user()';
  RAISE NOTICE 'Function: find_similar_profiles(user_id, threshold, max)';
END $$;
