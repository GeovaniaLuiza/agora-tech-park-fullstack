import express, { Router } from 'express';
import * as controller from '../controllers/indicatorImportController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { MAX_IMPORT_BYTES, MAX_IMPORT_REVIEW_BYTES } from '../domain/indicatorImportCatalog.js';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'PESQUISADOR'));
router.put('/batches/:id/review', express.json({ limit: MAX_IMPORT_REVIEW_BYTES }), controller.review);
// All other import operations retain the application's normal JSON limit.
router.use(express.json({ limit: '100kb' }));
router.get('/options', controller.options);
router.get('/export/status', controller.exportStatus);
router.post('/export', controller.exportWorkbook);
router.get('/:type/draft', controller.draft);
router.get('/:type/indicators', controller.indicators);
router.post('/:type/preview', express.raw({ type: '*/*', limit: MAX_IMPORT_BYTES }), controller.preview);
router.get('/batches/:id', controller.batch);
router.post('/batches/:id/group-events', controller.groupEvents);
router.post('/batches/:id/confirm', controller.confirm);
export default router;
