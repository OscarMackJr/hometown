import axios from 'axios';
import crypto from 'node:crypto';
import { ISemanticIntegration, SemanticRecord } from '../../core/types.js';

type IntrepidIntegrationMode = 'mock' | 'cube';

type IntrepidRunContext = {
  runId: string;
  tenantId: string;
  status: string;
  totalLoans: number;
  loansWithExceptions: number;
  balanceImpact: number;
  asOfDate: string;
};

export default class IntrepidLoanEngineIntegration implements ISemanticIntegration {
  public integrationId = 'intrepid_loan_engine';
  public supportedEntities = ['LoanProcessingRun'];

  public async fetchContext(entityId: string): Promise<SemanticRecord> {
    const mode = this.resolveMode();
    console.log(
      `[Intrepid Loan Engine Node] Loading tenant-scoped loan processing run context for: ${entityId} (${mode} mode)`
    );

    const runPayload = mode === 'cube'
      ? await this.fetchCubeRunContext(entityId)
      : this.fetchMockRunContext(entityId);

    return this.toSemanticRecord(runPayload);
  }

  private resolveMode(): IntrepidIntegrationMode {
    const mode = (process.env.INTREPID_INTEGRATION_MODE ?? 'mock').toLowerCase();
    if (mode === 'cube') return 'cube';
    return 'mock';
  }

  private fetchMockRunContext(entityId: string): IntrepidRunContext {
    return {
      runId: entityId,
      tenantId: '11111111-1111-4111-8111-111111111111',
      status: 'SUCCEEDED',
      totalLoans: 2,
      loansWithExceptions: 1,
      balanceImpact: 1234.56,
      asOfDate: '2026-06-28'
    };
  }

  private async fetchCubeRunContext(entityId: string): Promise<IntrepidRunContext> {
    const cubeUrl = process.env.CUBE_SANDBOX_URL ?? process.env.CUBE_URL ?? 'http://localhost:4000';
    const apiSecret = this.requireEnv('CUBEJS_API_SECRET');
    const tenantId = this.requireEnv('INTREPID_TENANT_ID');
    const token = this.createCubeToken(apiSecret);

    const runFilters = [
      {
        member: 'intrepid_loan_runs.tenant_id',
        operator: 'equals',
        values: [tenantId]
      },
      {
        member: 'intrepid_loan_runs.run_id',
        operator: 'equals',
        values: [entityId]
      }
    ];

    const loanFilters = [
      {
        member: 'intrepid_loans.tenant_id',
        operator: 'equals',
        values: [tenantId]
      },
      {
        member: 'intrepid_loans.run_id',
        operator: 'equals',
        values: [entityId]
      }
    ];

    const exceptionFilters = [
      {
        member: 'intrepid_loan_exceptions.tenant_id',
        operator: 'equals',
        values: [tenantId]
      },
      {
        member: 'intrepid_loan_exceptions.run_id',
        operator: 'equals',
        values: [entityId]
      }
    ];

    const [runRow, loanRow, exceptionRow] = await Promise.all([
      this.loadSingleCubeRow(cubeUrl, token, {
        dimensions: [
          'intrepid_loan_runs.run_id',
          'intrepid_loan_runs.status',
          'intrepid_loan_runs.as_of_date'
        ],
        filters: runFilters,
        limit: 1
      }),
      this.loadSingleCubeRow(cubeUrl, token, {
        measures: ['intrepid_loans.count'],
        filters: loanFilters
      }),
      this.loadSingleCubeRow(cubeUrl, token, {
        measures: [
          'intrepid_loan_exceptions.count',
          'intrepid_loan_exceptions.balance_impact'
        ],
        filters: exceptionFilters
      })
    ]);

    if (!runRow) {
      throw new Error(`Cube returned no Intrepid loan run context for ${entityId}`);
    }

    return {
      runId: String(runRow['intrepid_loan_runs.run_id'] ?? entityId),
      tenantId,
      status: String(runRow['intrepid_loan_runs.status'] ?? 'UNKNOWN'),
      totalLoans: this.toNumber(loanRow?.['intrepid_loans.count']),
      loansWithExceptions: this.toNumber(exceptionRow?.['intrepid_loan_exceptions.count']),
      balanceImpact: this.toNumber(exceptionRow?.['intrepid_loan_exceptions.balance_impact']),
      asOfDate: this.toDateString(runRow['intrepid_loan_runs.as_of_date'])
    };
  }

  private async loadSingleCubeRow(
    cubeUrl: string,
    token: string,
    query: Record<string, unknown>
  ): Promise<Record<string, unknown> | undefined> {
    const response = await axios.post(
      `${cubeUrl}/cubejs-api/v1/load`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30_000
      }
    );

    return response.data?.data?.[0];
  }

  private toSemanticRecord(runPayload: IntrepidRunContext): SemanticRecord {
    return {
      entityId: runPayload.runId,
      entityName: `Loan Processing Run ${runPayload.runId}`,
      attributes: {
        entityType: 'LoanProcessingRun',
        tenantId: runPayload.tenantId,
        status: runPayload.status,
        totalLoans: runPayload.totalLoans,
        loansWithExceptions: runPayload.loansWithExceptions,
        balanceImpact: runPayload.balanceImpact,
        asOfDate: runPayload.asOfDate
      },
      relationships: [
        {
          relation: 'HAS_LOAN_EXCEPTION',
          targetEntity: `${runPayload.tenantId}:${runPayload.runId}:loan_exceptions`,
          sourceNode: 'Intrepid_Loan_Engine_Postgres',
          metadata: {
            exceptionCount: runPayload.loansWithExceptions,
            balanceImpact: runPayload.balanceImpact
          }
        },
        {
          relation: 'HAS_PORTFOLIO_EXCEPTION',
          targetEntity: `${runPayload.tenantId}:${runPayload.runId}:portfolio_exceptions`,
          sourceNode: 'Intrepid_Loan_Engine_Postgres',
          metadata: {
            relationshipType: 'aggregate_portfolio_exceptions'
          }
        },
        {
          relation: 'SOURCE_NODE',
          targetEntity: 'Intrepid_Loan_Engine_Postgres',
          sourceNode: 'Intrepid_Loan_Engine_Postgres',
          metadata: {
            tenantScoped: true,
            rlsContextRequired: true,
            integrationMode: this.resolveMode()
          }
        }
      ]
    };
  }

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is required when INTREPID_INTEGRATION_MODE=cube`);
    }
    return value;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toDateString(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    return String(value);
  }

  private base64url(input: string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private createCubeToken(secret: string): string {
    const header = this.base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = this.base64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000) }));
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${header}.${payload}.${signature}`;
  }
}

