import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

import digilockerRoutes from './route.js';
import whatsappRoutes from './whatsappRoutes.js';
import agreementRoutes from './agreement.routes.js';
import blogRoutes from './blog.routes.js';
import errorHandler from './error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (_, res) => res.send('OK'));

app.use('/api/kyc/digilocker', digilockerRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/blogs', blogRoutes);

// Error handling middleware (must be before 404 handler)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});
