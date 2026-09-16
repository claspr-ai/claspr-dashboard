const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', app: 'Claspr', version: '1.0.0' });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Claspr running on port ' + PORT);
});
