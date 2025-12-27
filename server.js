// server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Debug logging
console.log('🚀 Server starting...');

// Test endpoints
app.get('/api/health', (req, res) => {
  console.log('✅ Health check called');
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString() 
  });
});

// Import API routes
async function setupRoutes() {
  try {
    console.log('📦 Loading API routes...');
    
    // Load each API file
    const askModule = await import('./api/ask.js');
    app.post('/api/ask', (req, res) => askModule.default(req, res));
    console.log('✅ Loaded /api/ask');
    
    const chatModule = await import('./api/chat.js');
    app.post('/api/chat', (req, res) => chatModule.default(req, res));
    console.log('✅ Loaded /api/chat');
    
    const documentsModule = await import('./api/documents.js');
    app.get('/api/documents', (req, res) => documentsModule.default(req, res));
    console.log('✅ Loaded /api/documents');
    
    const memoryModule = await import('./api/memory.js');
    app.get('/api/memory', (req, res) => memoryModule.default(req, res));
    app.delete('/api/memory', (req, res) => memoryModule.default(req, res));
    console.log('✅ Loaded /api/memory');
    
    const summarizeModule = await import('./api/summarize.js');
    app.post('/api/summarize', (req, res) => summarizeModule.default(req, res));
    console.log('✅ Loaded /api/summarize');
    
    const uploadModule = await import('./api/upload.js');
    app.post('/api/upload', (req, res) => uploadModule.default(req, res));
    console.log('✅ Loaded /api/upload');
    
    const statusModule = await import('./api/status.js');
    app.get('/api/status', (req, res) => statusModule.default(req, res));
    console.log('✅ Loaded /api/status');
    
  } catch (error) {
    console.error('❌ Error loading routes:', error);
  }
}

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start server
setupRoutes().then(() => {
  app.listen(PORT, () => {
    console.log(`🎉 Server running on port ${PORT}`);
    console.log(`🌐 Open: http://localhost:${PORT}`);
    console.log('📋 Available APIs:');
    console.log('   GET  /api/health');
    console.log('   GET  /api/status');
    console.log('   POST /api/ask');
    console.log('   POST /api/chat');
    console.log('   GET  /api/documents');
    console.log('   POST /api/summarize');
    console.log('   POST /api/upload');
  });
}).catch(error => {
  console.error('❌ Failed to start server:', error);
});
