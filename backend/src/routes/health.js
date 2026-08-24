import { Router } from 'express';
import { config } from '../config/index.js';

const router = Router();

/**
 * @route GET /api/health
 * @desc Server health check & status endpoint
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'MedSync API Backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
  });
});

export default router;
