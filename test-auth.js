// Test authentication script
const bcrypt = require('bcryptjs');

// Test the hash we're using
const testPassword = 'admin123';
const storedHash = '$2b$10$NhecTEtFzvszvQ7kAfgp9.v3fQDuBrhVoNw7dp0wtUOd2wyIi7U86';

console.log('Testing password verification...');
console.log('Password:', testPassword);
console.log('Hash:', storedHash);

bcrypt.compare(testPassword, storedHash).then(result => {
  console.log('Verification result:', result);
  if (result) {
    console.log('✅ Password verification successful!');
  } else {
    console.log('❌ Password verification failed!');
  }
});