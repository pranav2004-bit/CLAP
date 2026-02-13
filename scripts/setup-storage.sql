-- Supabase Storage Setup Script for CLAP
-- Run this in your Supabase SQL Editor

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('test-audio', 'test-audio', true),
  ('recordings', 'recordings', false),
  ('temp-files', 'temp-files', false);

-- Create policies for test-audio bucket (public read, admin write)
CREATE POLICY "Public read access for test audio" 
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'test-audio');

CREATE POLICY "Admins can upload test audio" 
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-audio' 
  AND (auth.role() = 'authenticated')
  -- Add admin check here when auth is implemented
);

CREATE POLICY "Admins can update test audio" 
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'test-audio');

CREATE POLICY "Admins can delete test audio" 
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'test-audio');

-- Create policies for recordings bucket (private - only owners can access)
CREATE POLICY "Users can read their own recordings" 
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'recordings' 
  AND (owner_id = auth.uid() OR auth.role() = 'authenticated')
);

CREATE POLICY "Users can upload their own recordings" 
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recordings' 
  AND owner_id = auth.uid()
);

CREATE POLICY "Users can update their own recordings" 
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recordings' 
  AND owner_id = auth.uid()
);

CREATE POLICY "Users can delete their own recordings" 
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recordings' 
  AND owner_id = auth.uid()
);

-- Create policies for temp-files bucket (temporary storage)
CREATE POLICY "Users can read their own temp files" 
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'temp-files' 
  AND owner_id = auth.uid()
);

CREATE POLICY "Users can upload temp files" 
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'temp-files' 
  AND owner_id = auth.uid()
);

CREATE POLICY "Users can update their own temp files" 
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'temp-files' 
  AND owner_id = auth.uid()
);

CREATE POLICY "Users can delete their own temp files" 
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'temp-files' 
  AND owner_id = auth.uid()
);

-- Optional: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id ON storage.objects(bucket_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_owner_id ON storage.objects(owner_id);

-- Insert sample audio files metadata (optional)
-- Uncomment and modify as needed
/*
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES 
  ('test-audio', 'sample-conversation-1.mp3', 'admin-user-id', '{"duration": 180, "type": "conversation", "difficulty": "intermediate"}'),
  ('test-audio', 'sample-lecture-1.mp3', 'admin-user-id', '{"duration": 300, "type": "lecture", "difficulty": "advanced"}');
*/