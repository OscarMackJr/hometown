export type RetrievalTier = 'L' | 'P' | 'M';
export type ReadTarget = 'primary' | 'replica' | 'pre_aggregation' | 'materialized_cache';
export type DegradationMode = 'fail_closed' | 'degrade_with_disclosure';
export type RetrievalAttemptStatus = 'ok' | 'timeout' | 'error' | 'empty';

export interface SourceLoadBudget {
  maxSustainedQps: number;
  maxConcurrent: number;
  permittedQueryWindows: string[];
  escalationContact: string;
}

export interface RetrievalTierPolicy {
  entityType: string;
  integrationId: string;
  tier: RetrievalTier;
  declaredFreshnessBound: string;
  permittedReadTarget: ReadTarget;
  timeoutMs: number;
  sourceLoadBudget: SourceLoadBudget;
}

export interface FeatureDegradationPolicy {
  featureTag: string;
  mode: DegradationMode;
  requiredSources: string[];
  perSourceTimeoutMs: Record<string, number>;
  overallRetrievalTimeoutMs: number;
  minimumEvidenceThreshold: number;
}

export interface RetrievalAttempt {
  source: string;
  status: RetrievalAttemptStatus;
  latencyMs: number;
  errorCategory?: string;
}

export interface GovernedRetrievalMetadata {
  attempted: RetrievalAttempt[];
  degradationMode: DegradationMode;
  contextComplete: boolean;
  disclosure?: string;
}

export interface GovernedRetrievalResult<T> {
  status: 'ok' | 'degraded' | 'refused';
  record?: T;
  reason?: 'context_unavailable' | 'minimum_evidence_not_met';
  retrieval: GovernedRetrievalMetadata;
}

export const RETRIEVAL_TIER_POLICIES: RetrievalTierPolicy[] = [
  {
    entityType: 'Customer',
    integrationId: 'enterprise_crm_slice',
    tier: 'P',
    declaredFreshnessBound: 'PT15M',
    permittedReadTarget: 'pre_aggregation',
    timeoutMs: 2_500,
    sourceLoadBudget: {
      maxSustainedQps: 5,
      maxConcurrent: 2,
      permittedQueryWindows: ['always'],
      escalationContact: 'crm-owner@example.invalid'
    }
  },
  {
    entityType: 'LedgerAccount',
    integrationId: 'divisional_financial_ledger',
    tier: 'P',
    declaredFreshnessBound: 'PT15M',
    permittedReadTarget: 'pre_aggregation',
    timeoutMs: 2_500,
    sourceLoadBudget: {
      maxSustainedQps: 3,
      maxConcurrent: 2,
      permittedQueryWindows: ['always'],
      escalationContact: 'ledger-owner@example.invalid'
    }
  },
  {
    entityType: 'BalanceSheet',
    integrationId: 'divisional_financial_ledger',
    tier: 'P',
    declaredFreshnessBound: 'PT15M',
    permittedReadTarget: 'pre_aggregation',
    timeoutMs: 2_500,
    sourceLoadBudget: {
      maxSustainedQps: 3,
      maxConcurrent: 2,
      permittedQueryWindows: ['always'],
      escalationContact: 'ledger-owner@example.invalid'
    }
  },
  {
    entityType: 'LoanProcessingRun',
    integrationId: 'intrepid_loan_engine',
    tier: 'P',
    declaredFreshnessBound: 'PT15M',
    permittedReadTarget: 'pre_aggregation',
    timeoutMs: 5_000,
    sourceLoadBudget: {
      maxSustainedQps: 2,
      maxConcurrent: 1,
      permittedQueryWindows: ['always'],
      escalationContact: 'intrepid-owner@example.invalid'
    }
  }
];

export const FEATURE_DEGRADATION_POLICIES: FeatureDegradationPolicy[] = [
  {
    featureTag: 'legacy_query_context',
    mode: 'fail_closed',
    requiredSources: ['enterprise_crm_slice', 'divisional_financial_ledger', 'intrepid_loan_engine'],
    perSourceTimeoutMs: {
      enterprise_crm_slice: 2_500,
      divisional_financial_ledger: 2_500,
      intrepid_loan_engine: 5_000
    },
    overallRetrievalTimeoutMs: 5_000,
    minimumEvidenceThreshold: 1
  },
  {
    featureTag: 'internal_summary_partial_allowed',
    mode: 'degrade_with_disclosure',
    requiredSources: [],
    perSourceTimeoutMs: {
      enterprise_crm_slice: 2_500,
      divisional_financial_ledger: 2_500,
      intrepid_loan_engine: 5_000
    },
    overallRetrievalTimeoutMs: 5_000,
    minimumEvidenceThreshold: 0
  },
  {
    featureTag: 'customer_or_regulated_advice',
    mode: 'fail_closed',
    requiredSources: ['intrepid_loan_engine'],
    perSourceTimeoutMs: {
      intrepid_loan_engine: 5_000
    },
    overallRetrievalTimeoutMs: 5_000,
    minimumEvidenceThreshold: 1
  }
];

export function getRetrievalTierPolicy(integrationId: string, entityType: string): RetrievalTierPolicy | undefined {
  return RETRIEVAL_TIER_POLICIES.find(
    (policy) => policy.integrationId === integrationId && policy.entityType === entityType
  );
}

export function getFeatureDegradationPolicy(featureTag: string): FeatureDegradationPolicy {
  const declared = FEATURE_DEGRADATION_POLICIES.find((policy) => policy.featureTag === featureTag);
  if (declared) return declared;

  return {
    featureTag,
    mode: 'fail_closed',
    requiredSources: [],
    perSourceTimeoutMs: {},
    overallRetrievalTimeoutMs: 1_000,
    minimumEvidenceThreshold: 1
  };
}

export function listRetrievalTierPolicies(): RetrievalTierPolicy[] {
  return [...RETRIEVAL_TIER_POLICIES];
}

export function listFeatureDegradationPolicies(): FeatureDegradationPolicy[] {
  return [...FEATURE_DEGRADATION_POLICIES];
}