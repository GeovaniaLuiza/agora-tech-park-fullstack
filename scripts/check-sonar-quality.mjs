const hostUrl = (process.env.SONAR_HOST_URL || 'https://sonarcloud.io').replace(/\/$/, '');
const token = process.env.SONAR_TOKEN;
const projectKey = process.env.SONAR_PROJECT_KEY;
const pullRequest = process.env.SONAR_PULL_REQUEST;

if (!token || !projectKey) {
  throw new Error('SONAR_TOKEN e SONAR_PROJECT_KEY são obrigatórios.');
}

const authorization = `Bearer ${token}`;

async function sonarRequest(pathname, parameters) {
  const url = new URL(pathname, hostUrl);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: { Authorization: authorization, Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sonar API ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

const scope = {
  projectKey,
  ...(pullRequest ? { pullRequest } : {}),
};

const qualityGate = await sonarRequest('/api/qualitygates/project_status', scope);
const gateStatus = qualityGate.projectStatus?.status;

if (gateStatus !== 'OK') {
  throw new Error(`Quality Gate reprovado: ${gateStatus || 'UNKNOWN'}.`);
}

const commonIssueScope = {
  componentKeys: projectKey,
  resolved: 'false',
  ps: '100',
  ...(pullRequest ? { pullRequest } : {}),
};

const [legacyIssues, mqrIssues] = await Promise.all([
  sonarRequest('/api/issues/search', {
    ...commonIssueScope,
    severities: 'BLOCKER,CRITICAL',
  }),
  sonarRequest('/api/issues/search', {
    ...commonIssueScope,
    impactSeverities: 'BLOCKER,HIGH',
  }),
]);

const blockingIssues = new Map();
[...(legacyIssues.issues || []), ...(mqrIssues.issues || [])].forEach((issue) => {
  blockingIssues.set(issue.key, issue);
});

if (blockingIssues.size > 0) {
  const summary = [...blockingIssues.values()]
    .slice(0, 20)
    .map((issue) => `${issue.rule}: ${issue.message}`)
    .join('\n- ');
  throw new Error(
    `${blockingIssues.size} issue(s) Critical/High bloqueiam a promoção:\n- ${summary}`,
  );
}

console.log('Quality Gate aprovado e nenhuma issue Critical/High aberta.');
