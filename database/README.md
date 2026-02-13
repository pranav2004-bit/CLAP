# Database Setup Instructions

## Prerequisites
1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project in your Supabase dashboard

## Setup Steps

### 1. Configure Environment Variables
Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
```bash
cp .env.example .env.local
```

Update the following values in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_supabase_anon_key
```

### 2. Create Database Tables
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `database/schema.sql`
4. Run the SQL script

This will create:
- `users` table with RLS policies
- `tests` table with sample data
- `questions` table structure
- `test_attempts` table for tracking progress
- Appropriate indexes and security policies

### 3. Set Up Authentication
The schema includes basic RLS policies. You may want to customize these based on your specific requirements.

### 4. Test the Connection
Run the development server to verify the database connection works:
```bash
npm run dev
```

## Database Structure

### Users Table
- `id`: UUID primary key
- `email`: Unique email address
- `role`: 'student' or 'admin'
- `full_name`: User's full name
- `created_at`: Timestamp

### Tests Table
- `id`: UUID primary key
- `name`: Test name
- `type`: Test type (listening, reading, etc.)
- `duration_minutes`: Test duration
- `total_questions`: Number of questions
- `instructions`: Test instructions

### Questions Table
- `id`: UUID primary key
- `test_id`: Foreign key to tests
- `question_text`: Question content
- `question_type`: Type of question
- `options`: JSON array of options (for MCQ)
- `correct_answer`: Correct answer
- `points`: Points for correct answer

### Test Attempts Table
- `id`: UUID primary key
- `user_id`: Foreign key to users
- `test_id`: Foreign key to tests
- `started_at`: When attempt started
- `completed_at`: When attempt completed
- `score`: User's score
- `status`: Current status

## Security Notes
- RLS policies ensure users can only access their own data
- Admin users have full access to all tables
- All tables have proper foreign key constraints
- Indexes are created for optimal query performance