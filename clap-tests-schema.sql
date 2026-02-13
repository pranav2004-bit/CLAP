-- CLAP Tests Schema
-- Create table for CLAP Tests (comprehensive test packages)

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

-- Create indexes for better performance
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

-- Row Level Security policies (only create if they don't exist)
-- Check if RLS is already enabled
DO $$ 
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'clap_tests' AND relrowsecurity = 't') THEN
    ALTER TABLE clap_tests ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'clap_test_components' AND relrowsecurity = 't') THEN
    ALTER TABLE clap_test_components ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'student_clap_assignments' AND relrowsecurity = 't') THEN
    ALTER TABLE student_clap_assignments ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies only if they don't exist
DO $$ 
BEGIN
  -- CLAP Tests policies
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'CLAP Tests are viewable by admins and assigned students') THEN
    CREATE POLICY "CLAP Tests are viewable by admins and assigned students"
      ON clap_tests FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
        OR 
        EXISTS (
          SELECT 1 FROM student_clap_assignments sa
          JOIN users u ON u.id = sa.student_id
          WHERE sa.clap_test_id = clap_tests.id
          AND u.id = auth.uid()
          AND u.role = 'student'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admins can manage CLAP Tests') THEN
    CREATE POLICY "Admins can manage CLAP Tests"
      ON clap_tests FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
      );
  END IF;

  -- CLAP Test Components policies
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'CLAP Test Components are viewable by admins and assigned students') THEN
    CREATE POLICY "CLAP Test Components are viewable by admins and assigned students"
      ON clap_test_components FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
        OR 
        EXISTS (
          SELECT 1 FROM student_clap_assignments sa
          JOIN clap_tests ct ON ct.id = sa.clap_test_id
          JOIN users u ON u.id = sa.student_id
          WHERE ct.id = clap_test_components.clap_test_id
          AND u.id = auth.uid()
          AND u.role = 'student'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admins can manage CLAP Test Components') THEN
    CREATE POLICY "Admins can manage CLAP Test Components"
      ON clap_test_components FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
      );
  END IF;

  -- Student CLAP Assignments policies
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Students can view their own assignments') THEN
    CREATE POLICY "Students can view their own assignments"
      ON student_clap_assignments FOR SELECT
      USING (
        student_id = auth.uid()
        OR
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admins can manage student assignments') THEN
    CREATE POLICY "Admins can manage student assignments"
      ON student_clap_assignments FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = 'admin'
        )
      );
  END IF;
END $$;