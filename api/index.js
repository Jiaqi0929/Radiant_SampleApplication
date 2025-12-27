// api/index.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Read all API files dynamically
const apiDir = path.join(__dirname);
const apiFiles = fs.readdirSync(apiDir).filter(file => 
  file.endsWith('.js') && file !== 'index.js' && file !== '_init.js'
);

// Import and use all API routes
for (const file of apiFiles) {
  try {
    const moduleName = file.replace('.js', '');
    const modulePath = `./${file}`;
    
    import(modulePath).then(module => {
      if (module.default) {
        app.use(`/api/${moduleName}`, (req, res, next) => {
          // Handle both direct calls and prefixed calls
          if (req.url === '' || req.url === '/') {
            return module.default(req, res, next);
          }
          next();
        });
        console.log(`Loaded API route: /api/${moduleName}`);
      }
    });
  } catch (error) {
    console.error(`Failed to load ${file}:`, error);
  }
}

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
