import { Router } from 'express';
import healthRoutes from './health.js';
import aiRoutes from './ai.js';
import emailRoutes from './email.js';
import calendarRoutes from './calendar.js';

const router = Router();

// Mount Routes
router.use('/health', healthRoutes);
router.use('/ai', aiRoutes);
router.use('/email', emailRoutes);
router.use('/calendar', calendarRoutes);

export default router;
