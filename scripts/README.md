# Seed Data Script

This directory contains scripts and data for populating the CLAP database with sample content for development and testing purposes.

## Files

- `seed.ts` - Main TypeScript seed script with comprehensive sample data
- `sample-questions.json` - JSON overview of the seed data structure

## Features

The seed script provides:

### Users
- 1 Admin user
- 4 Student users with realistic names

### Tests
- 5 complete test modules matching the CLAP specification:
  - Listening Test (10 questions)
  - Speaking Test (5 questions)  
  - Reading Test (12 questions)
  - Writing Test (2 essay prompts)
  - Vocabulary & Grammar Test (15 questions)

### Question Types
- Multiple Choice Questions (MCQ)
- Fill-in-the-blank questions
- Essay prompts
- Audio response prompts

### Sample Attempts
- Completed attempts with scores
- In-progress attempts
- Abandoned attempts
- Various completion dates for realistic testing

## Usage

```bash
# Run the seed script
node scripts/seed.ts

# Reset and re-seed (clear existing data first)
node scripts/seed.ts --reset
```

## Data Structure

The script generates deterministic IDs based on content, ensuring consistency across runs. All timestamps are generated relative to the current time for realistic testing scenarios.

## Integration

To integrate with your database:
1. Modify the seed script to use your actual database connection
2. Replace the mock data insertion with real database queries
3. Adjust the TypeScript interfaces to match your database schema

The current implementation provides the data structure and can be easily adapted to work with Supabase or any other database backend.