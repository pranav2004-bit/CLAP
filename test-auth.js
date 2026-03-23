// Test authentication script
const bcrypt = require('bcryptjs');

// Test the hash we're using
const testPassword = '000346';
const storedHash = '$2b$12$kc1erYlQdvB9JIVOVkW99uvME..rY1q.fk2hUyrfUnYCSw1YPjCsC';

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