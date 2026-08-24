import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, validateConfig } from './config/index.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import { startEmailWorker } from './workers/emailWorker.js';

// Validate Environment Configuration
validateConfig();


const app = express();

// Security Headers & Logging
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  config.clientUrl,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.endsWith('.onrender.com')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS Error: Origin ${origin} not allowed.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root Route
app.get('/', (req, res) => {
  res.json({
    message: 'MedSync Healthcare Appointment & Follow-up Manager API is running.',
    healthEndpoint: '/api/health',
    version: '1.0.0',
  });
});

// API Routes
app.use('/api', apiRoutes);

// Error Handling Middleware
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Start Server
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    '\x1b[36m%s\x1b[0m',
    `🏥 [MedSync Server] Running on http://0.0.0.0:${config.port} in ${config.nodeEnv} mode.`
  );
  // Start Background Email Queue Worker
  startEmailWorker();
});

export default app;

