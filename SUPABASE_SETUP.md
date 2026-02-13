# CLAP Test Application - Supabase Setup Guide

## 🚀 Getting Started with Real Supabase Integration

### Prerequisites
- Supabase account (free tier available)
- This CLAP Test Application codebase

### Step-by-Step Setup

#### 1. Create Supabase Project
1. Visit [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in project details:
   - **Name**: CLAP Test Application
   - **Database Password**: Strong password
   - **Region**: Closest to your location

#### 2. Get Your Credentials
1. Go to **Project Settings > API**
2. Copy these values:
   - **Project URL** (starts with `https://`)
   - **anon/public key** (long JWT token)
   - **service_role key** (keep secret!)

#### 3. Configure Environment Variables
Edit `.env.local` file and replace the placeholder values:

```env
NEXT_PUBLIC_SUPABASE_URL=your_actual_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key_here
```

#### 4. Set Up Database Tables
Run the SQL commands from `supabase-setup.sql` in your Supabase SQL Editor:
1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste the entire content of `supabase-setup.sql`
3. Click "Run" to execute

#### 5. Configure Authentication (Optional)
Enable Email authentication:
1. Go to **Authentication > Providers**
2. Enable "Email" provider
3. Configure email templates as needed

#### 6. Set Up Storage (For Audio Recording)
The setup script already creates the audio storage bucket. Verify:
1. Go to **Storage**
2. Confirm `audio-recordings` bucket exists
3. Bucket should be public for audio playback

### 📋 Database Schema Overview

The setup creates these tables:

- **users**: Student and admin accounts
- **tests**: Test definitions and metadata
- **questions**: Individual test questions
- **test_attempts**: Student test attempts and scores

### 🔐 Security Features

- Row Level Security (RLS) policies
- Role-based access control
- Public read access for published tests
- Private user data protection

### 🧪 Testing Your Setup

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Visit the application and try:
   - Admin login (if you created an admin user)
   - Student registration
   - Taking a test
   - Viewing results

### 🆘 Troubleshooting

**Common Issues:**

1. **"Invalid supabaseUrl" error**
   - Check that your URL starts with `https://`
   - Ensure no extra spaces in environment variables

2. **Authentication not working**
   - Verify email provider is enabled in Supabase
   - Check that service_role key is correct

3. **Database queries failing**
   - Confirm all tables were created successfully
   - Check RLS policies are enabled

4. **Audio recording issues**
   - Verify storage bucket exists and is public
   - Check browser permissions for microphone

### 🔄 Migration from Demo Mode

If you were previously using demo mode:
1. The application will automatically detect real credentials
2. No code changes needed
3. Existing UI and functionality remains the same
4. Data will now persist in your Supabase database

### 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js with Supabase Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- [Row Level Security Policies](https://supabase.com/docs/guides/auth/row-level-security)

### 💡 Pro Tips

1. **Development Workflow**: Use Supabase local development for faster iteration
2. **Monitoring**: Enable Supabase logs to track API usage
3. **Backup**: Regularly export your database for backups
4. **Performance**: Consider adding indexes on frequently queried columns

---

**Need Help?** Check the browser console for detailed error messages and Supabase logs for database query information.