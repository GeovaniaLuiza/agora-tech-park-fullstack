import { Router } from 'express';
import * as controller from '../controllers/responseController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.post('/forms/:id/responses', authenticate, authorize('RESIDENTE'), controller.create);
router.put('/forms/:id/responses/draft', authenticate, authorize('RESIDENTE'), controller.draft);
router.get('/organizations/:id/responses', authenticate, controller.listHistory);
router.get('/forms/:formId/organizations/:organizationId/responses', authenticate, controller.getResponse);
router.patch('/responses/:id/reopen', authenticate, authorize('ADMIN', 'PESQUISADOR'), controller.reopen);
export default router;
