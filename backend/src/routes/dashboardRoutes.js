import { Router } from 'express';
import * as controller from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'PESQUISADOR', 'GESTOR'));
router.get('/operational-summary', controller.operational);
router.get('/institutional-summary', controller.institutional);
router.get('/companies', controller.companies);
router.get('/financial', controller.financial);
router.get('/projects', controller.projects);
router.get('/engagement', controller.engagement);
router.get('/export', controller.exportSpreadsheet);
export default router;
