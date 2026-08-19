import { Router } from 'express';
import * as controller from '../controllers/indicatorManagementController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
const view = authorize('ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE');
const edit = authorize('ADMIN', 'PESQUISADOR', 'GESTOR');

router.use(authenticate);
router.get('/innovation-centers', view, controller.centers);
router.post('/innovation-centers', authorize('ADMIN'), controller.createCenter);
router.patch('/innovation-centers/:id', authorize('ADMIN'), controller.updateCenter);
router.get('/metadata', view, controller.metadata);
router.get('/definitions', authorize('ADMIN', 'PESQUISADOR'), controller.definitions);
router.post('/definitions', authorize('ADMIN', 'PESQUISADOR'), controller.createDefinition);
router.put('/definitions/:id', authorize('ADMIN', 'PESQUISADOR'), controller.updateDefinition);
router.delete('/definitions/:id', authorize('ADMIN', 'PESQUISADOR'), controller.removeDefinition);
router.get('/values', view, controller.values);
router.get('/values/history', view, controller.history);
router.post('/values', edit, controller.saveValue);
router.put('/values/:id', edit, controller.saveValue);
router.delete('/values/:id', edit, controller.removeValue);
router.patch('/applicability/:indicatorId', edit, controller.applicability);
router.get('/records/:type', view, controller.records);
router.post('/records/:type', edit, controller.createRecord);
router.put('/records/:type/:id', edit, controller.updateRecord);
router.delete('/records/:type/:id', edit, controller.removeRecord);

export default router;
