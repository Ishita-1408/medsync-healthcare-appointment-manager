import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getOrGeneratePreVisitSummary,
  getOrGeneratePostVisitSummary,
} from '../controllers/aiController.js';

const router = Router();

/**
 * @route POST /api/ai/pre-visit-summary
 * @desc Generate or fetch AI Pre-Visit Clinical Summary
 * @access Private (Authenticated Doctor or Patient)
 */
router.post('/pre-visit-summary', requireAuth, getOrGeneratePreVisitSummary);

/**
 * @route POST /api/ai/post-visit-summary
 * @desc Generate or fetch AI Post-Visit Patient-Friendly Summary
 * @access Private (Authenticated Doctor or Patient)
 */
router.post('/post-visit-summary', requireAuth, getOrGeneratePostVisitSummary);

export default router;
