import { Router } from 'express';
import * as controller from '../controllers/formController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validateForm, validateQuestion } from '../middlewares/validate.js';

const router = Router();
const manage = [authenticate, authorize('ADMIN', 'PESQUISADOR')];

router.get('/', authenticate, controller.list);
router.post('/', ...manage, validateForm, controller.create);
router.post('/:id/publish', ...manage, controller.publish);
router.post('/:id/close', ...manage, controller.close);
router.post('/:id/duplicate', ...manage, controller.duplicate);
router.patch('/:id/archive', ...manage, controller.archive);
router.get('/:id/progress', authenticate, authorize('ADMIN', 'PESQUISADOR', 'GESTOR'), controller.progress);
router.get('/:id/organizations', authenticate, controller.targets);
router.route('/:id')
  .get(authenticate, controller.get)
  .put(...manage, validateForm, controller.update)
  .delete(...manage, controller.archive);
router.route('/:id/questions')
  .get(authenticate, controller.questions)
  .post(...manage, validateQuestion, controller.addQuestion);
router.route('/:id/questions/:questionId')
  .patch(...manage, validateQuestion, controller.updateQuestion)
  .delete(...manage, controller.removeQuestion);
router.route('/:id/questions/:questionId/options')
  .get(authenticate, controller.questionOptions)
  .post(...manage, controller.addQuestionOption);

export default router;
