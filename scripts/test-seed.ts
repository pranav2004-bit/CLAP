import { seedDatabase } from './seed.js';

// Test the seed data generation
async function testSeed() {
  try {
    console.log('🧪 Testing seed data generation...\n');
    
    const data = await seedDatabase();
    
    console.log('✅ Seed data generated successfully!\n');
    
    console.log('📊 Data Summary:');
    console.log(`  Users: ${data.users.length}`);
    console.log(`  Tests: ${data.tests.length}`);
    console.log(`  Questions: ${data.questions.length}`);
    console.log(`  Attempts: ${data.attempts.length}\n`);
    
    console.log('📋 Sample Data Preview:');
    console.log('Users:', data.users.slice(0, 2));
    console.log('Tests:', data.tests);
    console.log('Questions (first 3):', data.questions.slice(0, 3));
    console.log('Attempts (first 2):', data.attempts.slice(0, 2));
    
  } catch (error) {
    console.error('❌ Error testing seed data:', error);
  }
}

testSeed();