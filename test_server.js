require('dotenv').config();
console.log('Testing minimal server startup...');

const express = require('express');
const app = express();
const PORT = 3002;

// Basic middleware
app.use(express.json());

// Simple route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Input routes for testing
app.post('/api/input', (req, res) => {
  console.log('Received request on /api/input:', req.body);
  res.status(200).send('OK');
});

app.post('/api/input2', (req, res) => {
  console.log('Received request on /api/input2:', req.body);
  res.status(200).send('OK');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Test server running at http://0.0.0.0:${PORT}`);
});

console.log('Server setup completed, listening should start...');