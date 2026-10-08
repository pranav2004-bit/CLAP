-- DEPRECATED: do not run this file. Verified against the real production
-- database: it has NO CHECK constraint on clap_tests.status at all (status
-- validation is enforced at the Django model layer via `choices=`, not the
-- database layer). This script is obsolete.
-- The real, verified schema now lives in Django migrations:
--   django-backend/api/migrations/0000_create_core_schema.py
-- Kept only for historical reference.

-- Fix for CLAP Tests status constraint
-- Run this to add 'deleted' to the allowed status values

-- First, drop the existing constraint
ALTER TABLE clap_tests DROP CONSTRAINT IF EXISTS clap_tests_status_check;

-- Add the new constraint with 'deleted' included
ALTER TABLE clap_tests 
ADD CONSTRAINT clap_tests_status_check 
CHECK (status IN ('draft', 'published', 'archived', 'deleted'));