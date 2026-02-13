-- CLAP Application Setup Script
-- Run this in your Supabase SQL Editor

-- Create the admin user
INSERT INTO users (email, password_hash, role, full_name, is_active, profile_completed)
VALUES (
  'admin@clap.edu',
  '$2b$10$rVvKTjQV8H7pHJkO7mKZ0.xxxxxxxxxxxxxxxx',
  'admin',
  'CLAP Administrator',
  true,
  true
)
ON CONFLICT (email) DO UPDATE SET 
  password_hash = '$2b$10$rVvKTjQV8H7pHJkO7mKZ0.xxxxxxxxxxxxxxxx',
  role = 'admin',
  is_active = true,
  profile_completed = true;

-- Create sample student accounts
INSERT INTO users (full_name, email, student_id, password_hash, role, is_active, profile_completed)
VALUES 
  ('Test Student 1', 'student1@test.com', 'STU001', '$2b$10$rVvKTjQV8H7pHJkO7mKZ0.xxxxxxxxxxxxxxxx', 'student', true, false),
  ('Test Student 2', 'student2@test.com', 'STU002', '$2b$10$rVvKTjQV8H7pHJkO7mKZ0.xxxxxxxxxxxxxxxx', 'student', true, false)
ON CONFLICT (student_id) DO NOTHING;

-- Verify the accounts were created
SELECT email, role, is_active, profile_completed FROM users ORDER BY created_at DESC;