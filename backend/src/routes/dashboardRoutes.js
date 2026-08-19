import { Router } from 'express';
import * as controller from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
const viewRoles = ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'];
const exportRoles = ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'];
router.use(authenticate);
router.get('/operational-summary', authorize(...viewRoles), controller.operational);
router.get('/institutional-summary', authorize(...viewRoles), controller.institutional);
router.get('/companies', authorize(...viewRoles), controller.companies);
router.get('/financial', authorize(...viewRoles), controller.financial);
router.get('/projects', authorize(...viewRoles), controller.projects);
router.get('/engagement', authorize(...viewRoles), controller.engagement);
router.get('/export', authorize(...exportRoles), controller.exportSpreadsheet);
export default router;
