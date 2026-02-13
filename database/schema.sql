-- CLAP Test Application Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create users table
create table users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  role text check (role in ('student', 'admin')) not null,
  full_name text,
  created_at timestamptz default now()
);

-- Create tests table
create table tests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text check (type in ('listening', 'speaking', 'reading', 'writing', 'vocabulary')) not null,
  duration_minutes integer not null,
  total_questions integer not null,
  instructions text,
  created_at timestamptz default now()
);

-- Create questions table
create table questions (
  id uuid primary key default uuid_generate_v4(),
  test_id uuid references tests(id) on delete cascade,
  question_text text not null,
  question_type text check (question_type in ('mcq', 'fill_blank', 'essay', 'audio_response')) not null,
  options jsonb,
  correct_answer text,
  audio_url text,
  image_url text,
  points integer default 1,
  order_index integer,
  created_at timestamptz default now()
);

-- Create test_attempts table
create table test_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  test_id uuid references tests(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  score decimal,
  max_score decimal,
  status text check (status in ('in_progress', 'completed', 'abandoned')) default 'in_progress',
  answers jsonb,
  created_at timestamptz default now()
);

-- Create indexes for better performance
create index idx_questions_test_id on questions(test_id);
create index idx_test_attempts_user_id on test_attempts(user_id);
create index idx_test_attempts_test_id on test_attempts(test_id);
create index idx_test_attempts_status on test_attempts(status);

-- Enable Row Level Security
alter table users enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table test_attempts enable row level security;

-- RLS Policies

-- Users can only view their own attempts
create policy "Users can view their own attempts" on test_attempts
  for select using (auth.uid() = user_id);

create policy "Users can insert their own attempts" on test_attempts
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own attempts" on test_attempts
  for update using (auth.uid() = user_id);

-- Users can view all tests (public read)
create policy "Anyone can view tests" on tests
  for select using (true);

create policy "Anyone can view questions" on questions
  for select using (true);

-- Admins can do everything
create policy "Admins have full access to users" on users
  for all using (
    exists (
      select 1 from users
      where id = auth.uid()
      and role = 'admin'
    )
  );

create policy "Admins have full access to tests" on tests
  for all using (
    exists (
      select 1 from users
      where id = auth.uid()
      and role = 'admin'
    )
  );

create policy "Admins have full access to questions" on questions
  for all using (
    exists (
      select 1 from users
      where id = auth.uid()
      and role = 'admin'
    )
  );

create policy "Admins have full access to test_attempts" on test_attempts
  for all using (
    exists (
      select 1 from users
      where id = auth.uid()
      and role = 'admin'
    )
  );

-- Insert sample admin user (you'll need to update the email and password)
insert into users (email, role, full_name) values 
('admin@clap-test.com', 'admin', 'CLAP Administrator');

-- Insert sample tests
insert into tests (name, type, duration_minutes, total_questions, instructions) values
('Listening Comprehension Test', 'listening', 25, 10, 'Listen to the audio clips and answer the questions that follow.'),
('Reading Comprehension Test', 'reading', 30, 10, 'Read the passages carefully and answer the questions.'),
('Vocabulary & Grammar Test', 'vocabulary', 20, 10, 'Test your vocabulary and grammar knowledge.'),
('Writing Test', 'writing', 45, 1, 'Write an essay on the given topic.'),
('Speaking Test', 'speaking', 15, 1, 'Record your response to the speaking prompt.');