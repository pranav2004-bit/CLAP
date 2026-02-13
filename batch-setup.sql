-- Add batches table to CLAP database
CREATE TABLE IF NOT EXISTS batches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_name VARCHAR(50) UNIQUE NOT NULL,
  start_year INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add batch_id foreign key to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_batch_id ON users(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_name ON batches(batch_name);

-- Insert sample batches
INSERT INTO batches (batch_name, start_year, end_year, is_active) VALUES
  ('2023-27', 2023, 2027, true),
  ('2024-28', 2024, 2028, true),
  ('2025-29', 2025, 2029, true)
ON CONFLICT (batch_name) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON batches TO authenticated;
GRANT SELECT ON batches TO anon;

-- Row Level Security policies
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Batches are viewable by everyone" 
  ON batches FOR SELECT 
  USING (true);

CREATE POLICY "Admins can manage batches" 
  ON batches FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  ));

-- Update existing users to have batch_id reference (optional)
-- UPDATE users SET batch_id = (SELECT id FROM batches WHERE batch_name = '2023-27' LIMIT 1) 
-- WHERE role = 'student' AND batch_id IS NULL;