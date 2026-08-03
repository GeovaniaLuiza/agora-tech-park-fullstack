import { Router } from 'express';
import * as controller from '../controllers/indicatorController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'PESQUISADOR', 'GESTOR'));
router.get('/', controller.list);
router.get('/history', controller.history);
router.get('/dashboard', controller.dashboard);
router.get('/export/:format', controller.exportReport);
router.post('/refresh', authorize('ADMIN', 'PESQUISADOR'), controller.refresh);
export default router;
