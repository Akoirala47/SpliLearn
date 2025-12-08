create table if not exists videos (
  id uuid default gen_random_uuid() primary key,
  topic_id uuid references topics(id) on delete cascade,
  youtube_id text not null,
  title text,
  description text,
  thumbnail_url text,
  created_at timestamp with time zone default now()
);

-- Add RLS policies if needed, generally public read is fine for this app context or authenticated read
alter table videos enable row level security;

create policy "Enable read access for all users"
on videos for select
using (true);

create policy "Enable insert for authenticated users only"
on videos for insert
with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

create table if not exists topic_notes (
  id uuid default gen_random_uuid() primary key,
  topic_id uuid references topics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  content text,
  updated_at timestamp with time zone default now(),
  unique(topic_id, user_id)
);

alter table topic_notes enable row level security;

create policy "Users can view their own notes"
on topic_notes for select
using (auth.uid() = user_id);

create policy "Users can insert/update their own notes"
on topic_notes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
