import { timingSafeEqual } from 'node:crypto';
import client from 'prom-client';
import { query } from '../db/pool.js';

export const metricsRegistry = new client.Registry();
metricsRegistry.setDefaultLabels({ service: 'agora-api' });
client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'agora_process_' });

const httpRequests = new client.Counter({
  name: 'agora_http_requests_total',
  help: 'Total de requisições HTTP concluídas.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

const httpDuration = new client.Histogram({
  name: 'agora_http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const loginFailures = new client.Counter({
  name: 'agora_login_failures_total',
  help: 'Tentativas de login rejeitadas, sem identificação pessoal.',
  labelNames: ['reason'],
  registers: [metricsRegistry],
});

export const formsCreated = new client.Counter({
  name: 'agora_forms_created_total',
  help: 'Formulários criados desde o início do processo.',
  registers: [metricsRegistry],
});

export const formsPublished = new client.Counter({
  name: 'agora_forms_published_total',
  help: 'Formulários publicados desde o início do processo.',
  registers: [metricsRegistry],
});

export const responsesSubmitted = new client.Counter({
  name: 'agora_responses_submitted_total',
  help: 'Respostas submetidas desde o início do processo.',
  registers: [metricsRegistry],
});

export const emailFailures = new client.Counter({
  name: 'agora_email_failures_total',
  help: 'Falhas de entrega de e-mail por finalidade e categoria.',
  labelNames: ['purpose', 'reason'],
  registers: [metricsRegistry],
});

const databaseUp = new client.Gauge({
  name: 'agora_database_up',
  help: '1 quando o PostgreSQL está acessível.',
  registers: [metricsRegistry],
  async collect() {
    try {
      await query('SELECT 1');
      this.set(1);
    } catch {
      this.set(0);
    }
  },
});

const databaseConnections = new client.Gauge({
  name: 'agora_database_connections',
  help: 'Conexões PostgreSQL da base atual por estado.',
  labelNames: ['state'],
  registers: [metricsRegistry],
  async collect() {
    this.reset();
    try {
      const { rows } = await query(`
        SELECT COALESCE(state, 'unknown') AS state, COUNT(*)::int AS count
        FROM pg_stat_activity
        WHERE datname=current_database()
        GROUP BY COALESCE(state, 'unknown')
      `);
      for (const row of rows) this.set({ state: row.state }, row.count);
    } catch {
      // database_up carries availability without emitting sensitive error details.
    }
  },
});

const databaseSize = new client.Gauge({
  name: 'agora_database_size_bytes',
  help: 'Tamanho da base PostgreSQL atual em bytes.',
  registers: [metricsRegistry],
  async collect() {
    try {
      const { rows } = await query('SELECT pg_database_size(current_database())::float AS size');
      this.set(rows[0]?.size || 0);
    } catch {
      this.set(0);
    }
  },
});

const businessTotals = new client.Gauge({
  name: 'agora_business_entities',
  help: 'Totais institucionais obtidos do banco, sem dados pessoais.',
  labelNames: ['entity'],
  registers: [metricsRegistry],
  async collect() {
    this.reset();
    try {
      const { rows } = await query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE last_login_at >= NOW() - INTERVAL '30 days')::int AS active_users,
          (SELECT COUNT(*) FROM forms WHERE status='ACTIVE')::int AS published_forms,
          (SELECT COUNT(*) FROM responses WHERE status='SUBMITTED')::int AS submitted_responses,
          (SELECT COUNT(*) FROM notifications)::int AS notifications,
          (SELECT COUNT(*) FROM notifications WHERE read_at IS NULL)::int AS unread_notifications
      `);
      const values = rows[0] || {};
      for (const [entity, value] of Object.entries(values)) this.set({ entity }, value);
    } catch {
      // Availability is represented by agora_database_up.
    }
  },
});

// Keep references explicit: these collectors register themselves on construction.
void databaseUp;
void databaseConnections;
void databaseSize;
void businessTotals;

function routeLabel(req) {
  if (!req.route?.path) return 'unmatched';
  return `${req.baseUrl || ''}${req.route.path}` || '/';
}

export function metricsMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    };
    httpRequests.inc(labels);
    httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
  });
  next();
}

function validMetricsToken(req) {
  if (process.env.NODE_ENV !== 'production') return true;
  const expected = process.env.METRICS_TOKEN;
  const received = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function metricsHandler(req, res, next) {
  if (!validMetricsToken(req)) return res.sendStatus(404);
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    return res.send(await metricsRegistry.metrics());
  } catch (error) {
    return next(error);
  }
}
