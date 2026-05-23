-- Enable pgvector extension
create extension if not exists vector;

-- Profiles table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  linkedin_subject text,
  display_name text,
  headline text,
  location text,
  avatar_url text,
  ingestion_status text default 'pending' check (ingestion_status in ('pending', 'complete', 'failed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- LinkedIn snapshots
create table if not exists linkedin_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  snapshot_json jsonb not null,
  fetched_at timestamptz default now(),
  api_version text default 'v2',
  unique(user_id)
);

-- User embeddings for vector search
create table if not exists user_embeddings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  embedding vector(1536),
  embedding_model text default 'text-embedding-3-small',
  updated_at timestamptz default now()
);

-- Create IVFFlat index for fast similarity search
create index if not exists user_embeddings_embedding_idx 
  on user_embeddings using ivfflat (embedding vector_cosine_ops) 
  with (lists = 100);

-- Conversation threads
create table if not exists conversation_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  thread_type text not null check (thread_type in ('onboarding', 'suggestion')),
  messages jsonb default '[]'::jsonb,
  related_suggestion_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Match suggestions
create table if not exists match_suggestions (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  matched_user_id uuid references auth.users(id) on delete cascade,
  rationale jsonb not null,
  status text default 'new' check (status in ('new', 'accepted', 'declined')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(recipient_id, matched_user_id)
);

-- Suggestion feedback
create table if not exists suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid references match_suggestions(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('accept', 'decline')),
  reason_text text,
  created_at timestamptz default now()
);

-- RLS Policies

-- Profiles: users can read/update their own
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Match suggestions: users can see suggestions where they are the recipient
alter table match_suggestions enable row level security;

create policy "Users can view their suggestions"
  on match_suggestions for select
  using (auth.uid() = recipient_id);

create policy "Users can update their suggestions"
  on match_suggestions for update
  using (auth.uid() = recipient_id);

-- Suggestion feedback: users can insert feedback for their suggestions
alter table suggestion_feedback enable row level security;

create policy "Users can insert feedback"
  on suggestion_feedback for insert
  with check (
    exists (
      select 1 from match_suggestions 
      where id = suggestion_id 
      and recipient_id = auth.uid()
    )
  );

-- Conversation threads: users can manage their own threads
alter table conversation_threads enable row level security;

create policy "Users can view own threads"
  on conversation_threads for select
  using (auth.uid() = user_id);

create policy "Users can insert own threads"
  on conversation_threads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own threads"
  on conversation_threads for update
  using (auth.uid() = user_id);

-- Enable realtime for match_suggestions
alter publication supabase_realtime add table match_suggestions;

-- Function to upsert user embedding (called from Edge Functions)
create or replace function upsert_user_embedding(
  p_user_id uuid,
  p_embedding vector(1536)
) returns void as $$
begin
  insert into user_embeddings (user_id, embedding, updated_at)
  values (p_user_id, p_embedding, now())
  on conflict (user_id)
  do update set embedding = p_embedding, updated_at = now();
end;
$$ language plpgsql security definer;

-- Function to calculate similarity between two users
create or replace function match_users_by_embedding(
  user_id_1 uuid,
  user_id_2 uuid
) returns float as $$
declare
  similarity float;
begin
  select 1 - (e1.embedding <=> e2.embedding)
  into similarity
  from user_embeddings e1, user_embeddings e2
  where e1.user_id = user_id_1
    and e2.user_id = user_id_2;
  
  return coalesce(similarity, 0);
end;
$$ language plpgsql security definer;

-- Trigger to create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
