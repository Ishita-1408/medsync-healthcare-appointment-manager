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

// CORS Configuration — Production Vercel domain, local development, and Render support
const allowedOrigins = [
  'https://medsync-healthcare-appointment-mana.vercel.app',
  'https://medsync-healthcare-appointment-manager-1zyefr4d8-ishita-6174.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  config.clientUrl,
].filter(Boolean);

export function isOriginAllowed(origin) {
  if (!origin) return true;
  const clean = origin.trim().toLowerCase();

  // Exact match with configured whitelist
  if (allowedOrigins.some((allowed) => allowed.toLowerCase() === clean)) {
    return true;
  }

  // Vercel deployment URLs (*.vercel.app)
  if (clean.endsWith('.vercel.app')) {
    return true;
  }

  // Render service URLs (*.onrender.com)
  if (clean.endsWith('.onrender.com')) {
    return true;
  }

  // Localhost & 127.0.0.1 on any port (HTTP & HTTPS)
  if (
    clean.startsWith('http://localhost:') ||
    clean.startsWith('https://localhost:') ||
    clean.startsWith('http://127.0.0.1:') ||
    clean.startsWith('https://127.0.0.1:')
  ) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24-hour preflight cache
};

// Register CORS Middleware
app.use(cors(corsOptions));

// Explicit Preflight Handler for all routes
app.options('*', cors(corsOptions));

// Fail-safe CORS Response Header Middleware (Guarantees CORS headers even on errors)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin'
    );
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Handler (both /api/health canonical & /health alias for Render health check)
const handleHealthCheck = (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'MedSync API Backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
    healthEndpoint: '/api/health',
  });
};

// Top-Level /health Alias (Render monitoring)
app.get('/health', handleHealthCheck);

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

