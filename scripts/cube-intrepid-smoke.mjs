import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const composeFiles = ['-f', 'cube/docker-compose.intrepid-smoke.yml'];
const projectName = 'hometown-intrepid-cube-smoke';
const cubeUrl = process.env.CUBE_SMOKE_URL ?? 'http://localhost:4000';
const apiSecret = process.env.CUBEJS_API_SECRET ?? 'intrepid-smoke-secret';
const tenantId = process.env.INTREPID_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
const expectedRunId = process.env.INTREPID_SMOKE_RUN_ID ?? 'INTREPID_RUN_2026_Q2_001';

function runDockerCompose(args, options = {}) {
  const result = spawnSync('docker', ['compose', '-p', projectName, ...composeFiles, ...args], {
    stdio: options.stdio ?? 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed with status ${result.status}`);
  }

  return result;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createCubeToken(secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${header}.${payload}.${signature}`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCube(token) {
  const deadline = Date.now() + 120_000;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cubeUrl}/cubejs-api/v1/meta`, {
        headers: { Authorization: token }
      });

      if (response.ok) {
        return;
      }

      lastError = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastError = error.message;
    }

    await sleep(3_000);
  }

  throw new Error(`Cube did not become ready within 120s. Last error: ${lastError}`);
}

async function queryIntrepidRun(token) {
  const response = await fetch(`${cubeUrl}/cubejs-api/v1/load`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: {
        measures: ['intrepid_loan_runs.count'],
        dimensions: ['intrepid_loan_runs.run_id', 'intrepid_loan_runs.status'],
        filters: [
          {
            member: 'intrepid_loan_runs.tenant_id',
            operator: 'equals',
            values: [tenantId]
          }
        ]
      }
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Cube load query failed with ${response.status}: ${body}`);
  }

  const parsed = JSON.parse(body);
  const row = parsed.data?.find((candidate) => candidate['intrepid_loan_runs.run_id'] === expectedRunId);

  if (!row) {
    throw new Error(`Cube load query did not return seeded run ${expectedRunId}: ${body}`);
  }

  if (row['intrepid_loan_runs.status'] !== 'SUCCEEDED') {
    throw new Error(`Seeded run returned unexpected status: ${JSON.stringify(row)}`);
  }

  const count = Number(row['intrepid_loan_runs.count']);
  if (count !== 1) {
    throw new Error(`Seeded run returned unexpected count: ${JSON.stringify(row)}`);
  }

  console.log(`Cube Intrepid smoke query passed for ${expectedRunId}.`);
}

const token = `Bearer ${createCubeToken(apiSecret)}`;

try {
  runDockerCompose(['up', '--detach', '--wait']);
  await waitForCube(token);
  await queryIntrepidRun(token);
} finally {
  runDockerCompose(['down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
}
