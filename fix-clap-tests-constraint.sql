-- Fix for CLAP Tests status constraint
-- Run this to add 'deleted' to the allowed status values

-- First, drop the existing constraint
ALTER TABLE clap_tests DROP CONSTRAINT IF EXISTS clap_tests_status_check;

-- Add the new constraint with 'deleted' included
ALTER TABLE clap_tests 
ADD CONSTRAINT clap_tests_status_check 
CHECK (status IN ('draft', 'published', 'archived', 'deleted'));