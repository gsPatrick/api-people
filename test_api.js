import http from 'http';
http.get('http://localhost:3000/api/custom-fields/JOBS', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const fields = JSON.parse(data);
      console.log('Returned Custom Fields for JOBS:');
      console.log(JSON.stringify(fields.slice(0, 5), null, 2)); // Show first 5
    } catch(e) { console.log('Error parsing:', data.substring(0, 100)); }
  });
});
