import { Router } from 'express';
import * as controller from '../controllers/organizationController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();
router.get('/', authenticate, controller.list);
router.post('/', authenticate, authorize('ADMIN'), controller.create);
router.route('/:id')
  .get(authenticate, controller.get)
  .put(authenticate, authorize('ADMIN'), controller.update)
  .delete(authenticate, authorize('ADMIN'), controller.remove);
export default router;
