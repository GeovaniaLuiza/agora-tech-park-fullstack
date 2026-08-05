import { Router } from 'express';
import * as controller from '../controllers/indicatorController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate);
router.get('/', authorize('ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'), controller.list);
router.get('/history', authorize('ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'), controller.history);
router.get('/dashboard', authorize('ADMIN', 'PESQUISADOR', 'GESTOR'), controller.dashboard);
router.get('/export/:format', authorize('ADMIN', 'PESQUISADOR', 'GESTOR'), controller.exportReport);
router.post('/refresh', authorize('ADMIN', 'PESQUISADOR'), controller.refresh);
export default router;
