import { Router } from 'express';
import * as controller from '../controllers/spreadsheetImportController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));
router.post('/validate', controller.validate);
router.post('/', controller.importSpreadsheet);
export default router;
