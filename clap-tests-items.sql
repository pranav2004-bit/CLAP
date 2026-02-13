-- CLAP Test Items Schema
-- Handles individual questions, content blocks, and student responses

-- 1. Table for individual items (questions, instructions, audio blocks, etc.)
CREATE TABLE IF NOT EXISTS clap_test_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  component_id UUID REFERENCES clap_test_components(id) ON DELETE CASCADE,
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('mcq', 'subjective', 'text_block', 'audio_block', 'file_upload')),
  order_index INTEGER NOT NULL,
  points INTEGER DEFAULT 0,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table for student responses to specific items
CREATE TABLE IF NOT EXISTS student_clap_responses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  assignment_id UUID REFERENCES student_clap_assignments(id) ON DELETE CASCADE,
  item_id UUID REFERENCES clap_test_items(id) ON DELETE CASCADE,
  response_data JSONB, -- Stores selected option index, text answer, or file URL
  is_correct BOOLEAN DEFAULT NULL, -- Null if not evaluated yet
  marks_awarded DECIMAL(5,2) DEFAULT NULL,
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assignment_id, item_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clap_test_items_component_id ON clap_test_items(component_id);
CREATE INDEX IF NOT EXISTS idx_student_clap_responses_assignment_id ON student_clap_responses(assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_clap_responses_item_id ON student_clap_responses(item_id);

-- RLS Policies

-- Enable RLS
ALTER TABLE clap_test_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_clap_responses ENABLE ROW LEVEL SECURITY;

-- Policies for clap_test_items
CREATE POLICY "Public read access for items" ON clap_test_items
  FOR SELECT USING (true); -- Ideally restrict to assigned students/admins, keeping simple for now to avoid complexity with component->test->assignment joins in policy

CREATE POLICY "Admins can manage items" ON clap_test_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Policies for student_clap_responses
CREATE POLICY "Students can view and create their own responses" ON student_clap_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM student_clap_assignments sa
      WHERE sa.id = student_clap_responses.assignment_id
      AND sa.student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all responses" ON student_clap_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON clap_test_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_clap_responses TO authenticated;
GRANT SELECT ON clap_test_items TO anon;
GRANT SELECT ON student_clap_responses TO anon;
