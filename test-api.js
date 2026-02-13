const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testApis() {
  console.log('Testing API routes...\n');
  
  try {
    // Test tests API
    console.log('1. Testing /api/tests...');
    const testsResponse = await fetch('http://localhost:3001/api/tests');
    const testsData = await testsResponse.json();
    console.log('Tests API Response:', testsData);
    console.log('Status:', testsResponse.status);
    console.log('');
    
    // Test attempts API
    console.log('2. Testing /api/attempts...');
    const attemptsResponse = await fetch('http://localhost:3001/api/attempts');
    const attemptsData = await attemptsResponse.json();
    console.log('Attempts API Response:', attemptsData);
    console.log('Status:', attemptsResponse.status);
    console.log('');
    
    // Test admin batches API
    console.log('3. Testing /api/admin/batches...');
    const batchesResponse = await fetch('http://localhost:3001/api/admin/batches');
    const batchesData = await batchesResponse.json();
    console.log('Batches API Response:', batchesData);
    console.log('Status:', batchesResponse.status);
    console.log('');
    
  } catch (error) {
    console.error('Error testing APIs:', error);
  }
}

testApis();