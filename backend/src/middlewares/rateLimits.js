import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';

const environment = process.env.NODE_ENV || 'development';

const defaults = environment === 'production'
  ? {
      global: { windowMs: 15 * 60 * 1000, limit: 100 },
      login: { windowMs: 15 * 60 * 1000, limit: 10 },
      register: { windowMs: 60 * 60 * 1000, limit: 5 },
      resend: { windowMs: 60 * 60 * 1000, limit: 5 },
      forgotPassword: { windowMs: 60 * 60 * 1000, limit: 5 },
      verify: { windowMs: 15 * 60 * 1000, limit: 20 },
    }
  : {
      global: { windowMs: 15 * 60 * 1000, limit: environment === 'test' ? 1000 : 500 },
      login: { windowMs: 60 * 1000, limit: environment === 'test' ? 100 : 30 },
      register: { windowMs: 60 * 1000, limit: environment === 'test' ? 100 : 20 },
      resend: { windowMs: 60 * 1000, limit: environment === 'test' ? 100 : 10 },
      forgotPassword: { windowMs: 60 * 1000, limit: environment === 'test' ? 100 : 10 },
      verify: { windowMs: 60 * 1000, limit: environment === 'test' ? 100 : 30 },
    };

function positiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const configured = (name, fallback) => ({
  windowMs: positiveInteger(`${name}_RATE_LIMIT_WINDOW_MS`, fallback.windowMs),
  limit: positiveInteger(`${name}_RATE_LIMIT_MAX`, fallback.limit),
});

const resendMinimumMinutes = positiveInteger('EMAIL_RESEND_MINUTES', 5);
const resendMaximumPerHour = positiveInteger('EMAIL_RESEND_MAX_PER_HOUR', 5);

export const RATE_LIMIT_CONFIG = Object.freeze({
  global: configured('GLOBAL', defaults.global),
  login: configured('LOGIN', defaults.login),
  register: configured('REGISTER', defaults.register),
  resend: configured('RESEND', defaults.resend),
  forgotPassword: configured('FORGOT_PASSWORD', defaults.forgotPassword),
  resendCooldown: configured('RESEND_COOLDOWN', environment === 'test'
    ? { windowMs: 1_000, limit: 1_000 }
    : { windowMs: resendMinimumMinutes * 60_000, limit: 1 }),
  resendEmail: configured('RESEND_EMAIL', environment === 'test'
    ? { windowMs: 1_000, limit: 1_000 }
    : { windowMs: 60 * 60_000, limit: resendMaximumPerHour }),
  verify: configured('VERIFY', defaults.verify),
});

const retryAfterSeconds = (request, windowMs) => {
  const resetAt = request.rateLimit?.resetTime?.getTime();
  return Math.max(1, Math.ceil(((resetAt || Date.now() + windowMs) - Date.now()) / 1000));
};

export function createRateLimiter(config, options = {}) {
  const {
    code = 'RATE_LIMIT_EXCEEDED',
    message = 'Muitas tentativas foram realizadas. Aguarde antes de tentar novamente.',
    nextAction = 'RETRY_LATER',
    ...rateLimitOptions
  } = options;
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...rateLimitOptions,
    handler: (request, response) => {
      const retryAfter = retryAfterSeconds(request, config.windowMs);
      response.set('Retry-After', String(retryAfter));
      response.status(429).json({
        code,
        message,
        retryAfter,
        retryAfterSeconds: retryAfter,
        requestCreated: false,
        nextAction,
      });
    },
  });
}

export function createEmailRateLimiter(config) {
  return createRateLimiter(config, {
    code: 'RESEND_RATE_LIMITED',
    message: 'Aguarde antes de solicitar um novo envio.',
    nextAction: 'RETRY_LATER',
    keyGenerator: (request) => crypto
      .createHash('sha256')
      .update(request.body?.email || '')
      .digest('hex'),
  });
}

export function configureTrustProxy(app) {
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isSafeInteger(hops) && hops > 0) app.set('trust proxy', hops);
}
