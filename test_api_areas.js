import http from 'http';
http.get('http://localhost:3000/api/areas', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const areas = JSON.parse(data);
      console.log('Returned Areas:', areas?.length);
      console.log(JSON.stringify(areas.slice(0, 5), null, 2));
    } catch(e) { console.log('Error parsing:', data.substring(0, 100)); }
  });
});
