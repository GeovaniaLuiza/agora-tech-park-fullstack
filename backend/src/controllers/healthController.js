import { getHealth } from '../services/healthService.js';

export function live(_req, res) {
  return res.json({ status: 'ok', services: { api: 'up' } });
}

export async function ready(_req, res, next) {
  try {
    const health = await getHealth();
    return res.status(health.services.database === 'up' ? 200 : 503).json(health);
  } catch (error) {
    return next(error);
  }
}
