-- CLAP Tests Schema - Minimal version for existing setup
-- Run this if you already have RLS policies and just need the tables

-- Create table for CLAP Tests (comprehensive test packages)
-- Only create if it doesn't exist
CREATE TABLE IF NOT EXISTS clap_tests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'deleted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create table for individual test components within CLAP tests
-- Only create if it doesn't exist
CREATE TABLE IF NOT EXISTS clap_test_components (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  clap_test_id UUID REFERENCES clap_tests(id) ON DELETE CASCADE,
  test_type VARCHAR(20) NOT NULL CHECK (test_type IN ('listening', 'speaking', 'reading', 'writing', 'vocabulary')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  max_marks INTEGER DEFAULT 10,
  duration_minutes INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for student CLAP test assignments
-- Only create if it doesn't exist
CREATE TABLE IF NOT EXISTS student_clap_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  clap_test_id UUID REFERENCES clap_tests(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'started', 'completed', 'expired', 'test_deleted')),
  total_score INTEGER,
  UNIQUE(student_id, clap_test_id)
);

-- Create indexes for better performance (will skip if they exist)
CREATE INDEX IF NOT EXISTS idx_clap_tests_batch_id ON clap_tests(batch_id);
CREATE INDEX IF NOT EXISTS idx_clap_tests_status ON clap_tests(status);
CREATE INDEX IF NOT EXISTS idx_clap_test_components_clap_test_id ON clap_test_components(clap_test_id);
CREATE INDEX IF NOT EXISTS idx_clap_test_components_test_type ON clap_test_components(test_type);
CREATE INDEX IF NOT EXISTS idx_student_clap_assignments_student_id ON student_clap_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_clap_assignments_clap_test_id ON student_clap_assignments(clap_test_id);
CREATE INDEX IF NOT EXISTS idx_student_clap_assignments_status ON student_clap_assignments(status);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON clap_tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clap_test_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_clap_assignments TO authenticated;

GRANT SELECT ON clap_tests TO anon;
GRANT SELECT ON clap_test_components TO anon;
GRANT SELECT ON student_clap_assignments TO anon;