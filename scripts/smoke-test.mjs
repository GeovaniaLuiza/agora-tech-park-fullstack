const apiUrl = process.env.API_URL?.replace(/\/$/, '');
const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
const smokeEmail = process.env.SMOKE_EMAIL;
const smokePassword = process.env.SMOKE_PASSWORD;

if (!apiUrl || !frontendUrl) {
  throw new Error('API_URL e FRONTEND_URL são obrigatórios.');
}

async function requireResponse(url, options, acceptedStatuses = [200]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!acceptedStatuses.includes(response.status)) {
      throw new Error(`${url} retornou HTTP ${response.status}.`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

const health = await requireResponse(`${apiUrl}/api/health`);
const healthBody = await health.json();
if (!['ok', 'degraded'].includes(healthBody.status) || healthBody.services?.database !== 'up') {
  throw new Error(`Health check inválido: ${JSON.stringify(healthBody)}`);
}

const frontend = await requireResponse(frontendUrl, { redirect: 'follow' });
const html = await frontend.text();
if (!html.toLowerCase().includes('<!doctype html')) {
  throw new Error('O frontend não retornou um documento HTML válido.');
}

if (smokeEmail && smokePassword) {
  const login = await requireResponse(
    `${apiUrl}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
    },
    [200],
  );
  const loginBody = await login.json();
  if (!loginBody.token && !loginBody.accessToken) {
    throw new Error('Login de smoke test não retornou token.');
  }
} else {
  console.log('SMOKE_EMAIL/SMOKE_PASSWORD ausentes; login não destrutivo foi ignorado.');
}

console.log('Smoke tests de produção concluídos com sucesso.');

