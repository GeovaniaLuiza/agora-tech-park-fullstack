import { Router } from 'express';
import * as controller from '../controllers/notificationController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.patch('/:id/read', controller.markRead);

export default router;
