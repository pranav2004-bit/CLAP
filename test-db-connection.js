// Direct database test script
const { createClient } = require('@supabase/supabase-js');

// Use the same credentials as in your .env.local
const supabaseUrl = 'https://fjuhxlllncnidbbqqlzha.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdWh4bGxsbmNuaWRicXFsemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzgwMDAsImV4cCI6MjA4NjExNDAwMH0.TzQ3s0gf9VpNHEagJGtskJWIchI4-3_6lxRtzypefF4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing Supabase connection...');
  
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('Connection error:', error);
    } else {
      console.log('✅ Connection successful!');
      console.log('Data:', data);
    }
    
    // Test specific admin query
    console.log('\nTesting admin user query...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@clap.edu')
      .eq('role', 'admin')
      .single();
    
    if (userError) {
      console.log('User query error:', userError);
    } else {
      console.log('✅ User found:', userData);
    }
    
  } catch (err) {
    console.log('Test failed:', err);
  }
}

testConnection();