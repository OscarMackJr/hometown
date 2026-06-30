import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), 'cube', '.env');
const requiredEnvVars = [
  'CUBEJS_API_SECRET',
  'INTREPID_TENANT_ID'
];

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing cube/.env. Create it from cube/.env.example before running the Cube-mode factory test.');
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function assertCubeIsReachable() {
  const cubeUrl = process.env.CUBE_SANDBOX_URL ?? process.env.CUBE_URL ?? 'http://localhost:4000';
  const response = await fetch(`${cubeUrl}/cubejs-api/v1/meta`, {
    headers: {
      Authorization: `Bearer ${createCubeToken(process.env.CUBEJS_API_SECRET ?? '')}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cube is not ready at ${cubeUrl}: ${response.status} ${body}`);
  }
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

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function assertRequiredEnv() {
  const missing = requiredEnvVars.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required Cube-mode env var(s): ${missing.join(', ')}`);
  }
}

try {
  loadLocalEnv();
  process.env.INTREPID_INTEGRATION_MODE = 'cube';
  assertRequiredEnv();
  await assertCubeIsReachable();
  await import('../dist/tests/factory-evaluation-rig.js');
} catch (error) {
  console.error('Cube-mode factory test setup failed.');
  console.error(error);
  process.exit(1);
}
