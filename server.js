// server.js - Debug version
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

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/health',
      '/api/status',
      '/api/test'
    ]
  });
});

// Status endpoint (without LangChain)
app.get('/api/status', (req, res) => {
  res.json({
    api: "RAG LangChain System",
    status: "ready",
    timestamp: new Date().toISOString(),
    stats: {
      documents: 0,
      users: 0
    }
  });
});

// Simple test endpoints
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint works!', timestamp: new Date().toISOString() });
});

app.post('/api/test', (req, res) => {
  res.json({ 
    message: 'POST test endpoint works!', 
    received: req.body,
    timestamp: new Date().toISOString() 
  });
});

// Ask endpoint (simplified)
app.post('/api/ask', async (req, res) => {
  try {
    console.log('Ask endpoint called:', req.body);
    
    if (!req.body.question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Mock response for testing
    const mockResponse = {
      answer: `I received your question: "${req.body.question}". This is a test response.`,
      sources: [],
      userId: req.body.userId || 'default',
      relevantChunks: 0
    };
    
    res.json(mockResponse);
  } catch (error) {
    console.error('Error in /api/ask:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload endpoint (simplified)
app.post('/api/upload', async (req, res) => {
  try {
    console.log('Upload endpoint called');
    
    // Mock success response
    res.json({
      success: true,
      message: "PDF uploaded and processed (mock)",
      documentId: 'mock-' + Date.now(),
      chunks: 5,
      filename: 'mock.pdf'
    });
  } catch (error) {
    console.error('Error in /api/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint (simplified)
app.post('/api/chat', async (req, res) => {
  try {
    console.log('Chat endpoint called:', req.body);
    
    if (!req.body.message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const mockResponse = {
      response: `I heard you say: "${req.body.message}". This is a mock chat response.`,
      userId: req.body.userId || 'default',
      memoryLength: 1,
      timestamp: new Date().toISOString()
    };
    
    res.json(mockResponse);
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Summarize endpoint (simplified)
app.post('/api/summarize', async (req, res) => {
  try {
    console.log('Summarize endpoint called');
    
    const mockResponse = {
      summary: "This is a mock summary of your text.",
      originalLength: req.body.text?.length || 100,
      summaryLength: 30,
      type: req.body.documentId ? "document" : "text",
      ...(req.body.documentId && { documentName: "mock-document.pdf" })
    };
    
    res.json(mockResponse);
  } catch (error) {
    console.error('Error in /api/summarize:', error);
    res.status(500).json({ error: error.message });
  }
});

// Documents endpoint (simplified)
app.get('/api/documents', (req, res) => {
  res.json({
    totalDocuments: 0,
    documents: []
  });
});

// Memory endpoint (simplified)
app.get('/api/memory', (req, res) => {
  res.json({
    userId: req.query.userId || 'default',
    messageCount: 0,
    recentMessages: [],
    status: 'No memory found'
  });
});

app.delete('/api/memory', (req, res) => {
  res.json({
    success: true,
    message: "Memory cleared",
    userId: req.body.userId || 'default'
  });
});

// Serve index.html for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Test endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   GET  http://localhost:${PORT}/api/status`);
  console.log(`   POST http://localhost:${PORT}/api/ask`);
  console.log(`   POST http://localhost:${PORT}/api/upload`);
  console.log(`   POST http://localhost:${PORT}/api/chat`);
  console.log(`   🌐 Open http://localhost:${PORT} in your browser`);
});
