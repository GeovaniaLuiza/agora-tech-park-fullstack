import { Router } from 'express';
import { forgotPassword, login, logout, me, registerRequest, resendVerification, resetPassword, updateAvatar, verifyEmail } from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateForgotPassword, validateLogin, validatePasswordReset, validateRegisterRequest, validateResend, validateVerification } from '../middlewares/authValidation.js';
import { createEmailRateLimiter, createRateLimiter, RATE_LIMIT_CONFIG } from '../middlewares/rateLimits.js';
const router=Router();
const loginLimit=createRateLimiter(RATE_LIMIT_CONFIG.login,{skipSuccessfulRequests:true});
const registrationLimit=createRateLimiter(RATE_LIMIT_CONFIG.register);
const resendLimit=createRateLimiter(RATE_LIMIT_CONFIG.resend,{
  code:'RESEND_RATE_LIMITED',
  message:'Aguarde antes de solicitar um novo envio.',
  nextAction:'RETRY_LATER',
});
const resendEmailLimit=createEmailRateLimiter(RATE_LIMIT_CONFIG.resendEmail);
const resendCooldownLimit=createEmailRateLimiter(RATE_LIMIT_CONFIG.resendCooldown);
const verifyLimit=createRateLimiter(RATE_LIMIT_CONFIG.verify);
const forgotPasswordLimit=createEmailRateLimiter(RATE_LIMIT_CONFIG.forgotPassword);
router.post('/login',validateLogin,loginLimit,login);
router.post('/register-request',validateRegisterRequest,registrationLimit,registerRequest);
router.post('/verify-email',validateVerification,verifyLimit,verifyEmail);
router.post('/resend-verification',validateResend,resendLimit,resendCooldownLimit,resendEmailLimit,resendVerification);
router.post('/forgot-password',validateForgotPassword,forgotPasswordLimit,forgotPassword);
router.post('/reset-password',validatePasswordReset,verifyLimit,resetPassword);
router.post('/logout',authenticate,logout);
router.get('/me',authenticate,me);
router.patch('/me/avatar',authenticate,updateAvatar);
export default router;
