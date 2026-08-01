import fs from 'node:fs';
import path from 'node:path';
import { DarkFactoryEngine } from '../dist/core/factory.js';
import {
  getFeatureDegradationPolicy,
  listFeatureDegradationPolicies,
  listRetrievalTierPolicies
} from '../dist/core/retrieval-policy.js';
import { canonicalize, hashSemanticRecord } from '../dist/core/hash.js';

const root = process.cwd();
const failures = [];
const integrationDir = path.join(root, 'src', 'integrations');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parseSupportedEntities() {
  const declared = [];
  for (const dirent of fs.readdirSync(integrationDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const sourcePath = path.join(integrationDir, dirent.name, 'index.ts');
    if (!fs.existsSync(sourcePath)) continue;
    const source = fs.readFileSync(sourcePath, 'utf8');
    const integrationMatch = source.match(/integrationId\s*=\s*['"]([^'"]+)['"]/);
    const entitiesMatch = source.match(/supportedEntities\s*=\s*\[([^\]]+)\]/);
    if (!integrationMatch || !entitiesMatch) continue;
    const integrationId = integrationMatch[1];
    for (const entity of entitiesMatch[1].split(',')) {
      const clean = entity.trim().replace(/^['"]|['"]$/g, '');
      if (clean) declared.push({ integrationId, entityType: clean });
    }
  }
  return declared;
}

function makeRecord(entityId) {
  return {
    entityId,
    entityName: `Record ${entityId}`,
    attributes: {},
    relationships: []
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function verifySourceContracts() {
  const policySource = read('src/core/retrieval-policy.ts');
  for (const snippet of [
    "export type RetrievalTier = 'L' | 'P' | 'M'",
    "export type DegradationMode = 'fail_closed' | 'degrade_with_disclosure'",
    'declaredFreshnessBound',
    'sourceLoadBudget',
    'overallRetrievalTimeoutMs',
    "mode: 'fail_closed'"
  ]) {
    assert(policySource.includes(snippet), `retrieval policy source missing required contract text: ${snippet}`);
  }

  const factorySource = read('src/core/factory.ts');
  for (const snippet of [
    'queryContextWithPolicy',
    'retrieval_timeout',
    'contextComplete',
    'source_budget_exceeded',
    'circuit_open'
  ]) {
    assert(factorySource.includes(snippet), `factory source missing retrieval governance behavior: ${snippet}`);
  }
}

function verifyTierCompleteness() {
  const declaredEntities = parseSupportedEntities();
  const policies = listRetrievalTierPolicies();
  for (const entity of declaredEntities) {
    const match = policies.find(
      (policy) => policy.integrationId === entity.integrationId && policy.entityType === entity.entityType
    );
    assert(
      Boolean(match),
      `missing retrieval tier policy for ${entity.integrationId}:${entity.entityType}`
    );
  }
}

function verifyPolicyRegistry() {
  const undeclared = getFeatureDegradationPolicy('not_declared_anywhere');
  assert(undeclared.mode === 'fail_closed', 'undeclared feature tags must default to fail_closed');
  assert(undeclared.minimumEvidenceThreshold === 1, 'undeclared fail_closed policy must require evidence');

  const featureTags = new Set();
  for (const policy of listFeatureDegradationPolicies()) {
    assert(!featureTags.has(policy.featureTag), `duplicate feature degradation policy: ${policy.featureTag}`);
    featureTags.add(policy.featureTag);
    assert(['fail_closed', 'degrade_with_disclosure'].includes(policy.mode), `invalid degradation mode for ${policy.featureTag}`);
    assert(policy.overallRetrievalTimeoutMs > 0, `overall timeout must be positive for ${policy.featureTag}`);
  }
}

function verifyCanonicalHashDeterminism() {
  const left = {
    entityId: 'entity-1',
    entityName: 'Entity One',
    attributes: {
      zeta: 1,
      Alpha: 2,
      nested: {
        b: true,
        a: false
      }
    },
    relationships: [
      {
        relation: 'RELATES_TO',
        targetEntity: 'entity-2',
        sourceNode: 'source-a',
        metadata: {
          beta: 'b',
          alpha: 'a'
        }
      }
    ]
  };
  const right = {
    relationships: [
      {
        metadata: {
          alpha: 'a',
          beta: 'b'
        },
        sourceNode: 'source-a',
        targetEntity: 'entity-2',
        relation: 'RELATES_TO'
      }
    ],
    attributes: {
      nested: {
        a: false,
        b: true
      },
      Alpha: 2,
      zeta: 1
    },
    entityName: 'Entity One',
    entityId: 'entity-1'
  };

  assert(canonicalize(left) === canonicalize(right), 'canonical JSON should be stable across object key insertion order');
  assert(hashSemanticRecord(left) === hashSemanticRecord(right), 'semantic record hash should be stable across object key insertion order');
}
async function verifyTimeoutAttempt() {
  const factory = new DarkFactoryEngine();
  factory.registerIntegration({
    integrationId: 'intrepid_loan_engine',
    supportedEntities: ['LoanProcessingRun'],
    async fetchContext() {
      await sleep(1_200);
      return makeRecord('late-record');
    }
  });

  const result = await factory.queryContextWithPolicy('intrepid_loan_engine', 'late-record', {
    featureTag: 'not_declared_timeout_probe',
    entityType: 'LoanProcessingRun'
  });

  assert(result.status === 'refused', 'timeout under fail_closed should refuse');
  assert(result.retrieval.attempted[0]?.status === 'timeout', 'timeout attempt should be recorded as timeout');
  assert(result.retrieval.contextComplete === false, 'timeout should mark contextComplete false');
}

async function verifyFailClosedError() {
  const factory = new DarkFactoryEngine();
  factory.registerIntegration({
    integrationId: 'intrepid_loan_engine',
    supportedEntities: ['LoanProcessingRun'],
    async fetchContext() {
      throw new Error('source_unavailable');
    }
  });

  const result = await factory.queryContextWithPolicy('intrepid_loan_engine', 'run-1', {
    featureTag: 'customer_or_regulated_advice',
    entityType: 'LoanProcessingRun'
  });

  assert(result.status === 'refused', 'fail_closed should refuse when required source errors');
  assert(result.reason === 'context_unavailable', 'fail_closed missing required source should report context_unavailable');
  assert(result.retrieval.attempted[0]?.status === 'error', 'source error attempt should be recorded as error');
}

async function verifyDegradeWithDisclosure() {
  const factory = new DarkFactoryEngine();
  factory.registerIntegration({
    integrationId: 'enterprise_crm_slice',
    supportedEntities: ['Customer'],
    async fetchContext() {
      throw new Error('crm_unavailable');
    }
  });

  const result = await factory.queryContextWithPolicy('enterprise_crm_slice', 'cust-1', {
    featureTag: 'internal_summary_partial_allowed',
    entityType: 'Customer'
  });

  assert(result.status === 'degraded', 'degrade_with_disclosure should return degraded status for optional source failure');
  assert(result.retrieval.contextComplete === false, 'degraded response should mark contextComplete false');
  assert(Boolean(result.retrieval.disclosure), 'degraded response should include disclosure text');
}

async function verifyOkPath() {
  const factory = new DarkFactoryEngine();
  factory.registerIntegration({
    integrationId: 'enterprise_crm_slice',
    supportedEntities: ['Customer'],
    async fetchContext(entityId) {
      return makeRecord(entityId);
    }
  });

  const result = await factory.queryContextWithPolicy('enterprise_crm_slice', 'cust-1', {
    featureTag: 'internal_summary_partial_allowed',
    entityType: 'Customer'
  });

  assert(result.status === 'ok', 'successful retrieval should return ok');
  assert(result.record?.entityId === 'cust-1', 'successful retrieval should return validated record');
  assert(result.retrieval.attempted[0]?.status === 'ok', 'successful attempt should be recorded as ok');
  assert(result.retrieval.contextComplete === true, 'successful retrieval should mark contextComplete true');
}

verifySourceContracts();
verifyTierCompleteness();
verifyPolicyRegistry();
verifyCanonicalHashDeterminism();
await verifyTimeoutAttempt();
await verifyFailClosedError();
await verifyDegradeWithDisclosure();
await verifyOkPath();

if (failures.length > 0) {
  console.error('Retrieval policy verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Retrieval policy verification passed. Tier assignments, degradation defaults, timeout/error attempts, fail-closed, and partial disclosure are covered.');
