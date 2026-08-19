import { Router } from 'express';
import { live, ready } from '../controllers/healthController.js';

const router = Router();

router.get('/live', live);
router.get('/ready', ready);
router.get('/', ready);

export default router;
