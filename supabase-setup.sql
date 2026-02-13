-- CLAP Test Application Database Schema
-- Run these commands in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (if not using Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) CHECK (role IN ('student', 'admin')) DEFAULT 'student',
  full_name VARCHAR(255),
  username VARCHAR(100),
  student_id VARCHAR(50) UNIQUE,
  password_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tests table
CREATE TABLE IF NOT EXISTS tests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('listening', 'speaking', 'reading', 'writing', 'vocabulary')) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  total_questions INTEGER NOT NULL,
  instructions TEXT,
  status VARCHAR(20) CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) CHECK (question_type IN ('mcq', 'fill_blank', 'essay', 'audio_response')) NOT NULL,
  options JSONB, -- Store array of options for MCQ
  correct_answer TEXT,
  audio_url TEXT,
  image_url TEXT,
  points INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Attempts table
CREATE TABLE IF NOT EXISTS test_attempts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  score DECIMAL(5,2),
  max_score DECIMAL(5,2),
  status VARCHAR(20) CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',
  answers JSONB, -- Store student answers
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage buckets for audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio-recordings', 'audio-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
FOR SELECT USING (auth.uid() = id);

-- Admins can manage all data
CREATE POLICY "Admins can manage users" ON users
FOR ALL USING (EXISTS (
  SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
));

-- Tests are publicly readable when published
CREATE POLICY "Published tests are public" ON tests
FOR SELECT USING (status = 'published');

-- Admins can manage tests
CREATE POLICY "Admins can manage tests" ON tests
FOR ALL USING (EXISTS (
  SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
));

-- Questions are readable for published tests
CREATE POLICY "Questions accessible for published tests" ON questions
FOR SELECT USING (EXISTS (
  SELECT 1 FROM tests WHERE id = questions.test_id AND status = 'published'
));

-- Admins can manage questions
CREATE POLICY "Admins can manage questions" ON questions
FOR ALL USING (EXISTS (
  SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
));

-- Users can view their own test attempts
CREATE POLICY "Users can view own attempts" ON test_attempts
FOR SELECT USING (auth.uid() = user_id);

-- Users can create test attempts
CREATE POLICY "Users can create attempts" ON test_attempts
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own attempts
CREATE POLICY "Users can update own attempts" ON test_attempts
FOR UPDATE USING (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "Anyone can upload audio" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'audio-recordings');

CREATE POLICY "Audio recordings are publicly accessible" ON storage.objects
FOR SELECT USING (bucket_id = 'audio-recordings');