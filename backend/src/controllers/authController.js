import * as authService from '../services/authService.js';
import { loginFailures } from '../observability/metrics.js';

export async function login(req,res,next){try{res.json(await authService.login(req.body,req.ip));}catch(error){loginFailures.inc({ reason: String(error.code || 'unknown').toLowerCase() });next(error);}}
export async function registerRequest(req,res,next){try{await authService.registerRequest(req.body,req.ip);res.status(201).json({
  message:'Solicitação recebida. Enviamos uma mensagem para o seu e-mail. Confirme o endereço para que sua solicitação seja encaminhada à equipe do Ágora Tech Park.',
  requestCreated:true,
  notificationSent:true,
  nextAction:'VERIFY_EMAIL',
});}catch(error){next(error);}}
export async function verifyEmail(req,res,next){try{res.json(await authService.verifyEmail(req.body.token,req.ip));}catch(error){next(error);}}
export async function resendVerification(req,res,next){try{res.status(202).json(await authService.resendVerification(req.body.email,req.ip));}catch(error){next(error);}}
export async function forgotPassword(req,res,next){try{res.status(202).json(await authService.forgotPassword(req.body.email,req.ip));}catch(error){next(error);}}
export async function resetPassword(req,res,next){try{res.json(await authService.resetPassword(req.body.token,req.body.password,req.ip));}catch(error){next(error);}}
export async function me(req,res,next){try{res.json({user:await authService.me(req.user.sub)});}catch(error){next(error);}}
export async function updateAvatar(req,res,next){try{res.json({user:await authService.updateAvatar(req.user.sub, req.body.avatarData ?? null)});}catch(error){next(error);}}
export async function logout(req,res,next){try{await authService.logout(req.user.sub,req.ip);res.sendStatus(204);}catch(error){next(error);}}
