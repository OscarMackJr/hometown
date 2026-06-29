export default class IntrepidLoanEngineIntegration {
    integrationId = 'intrepid_loan_engine';
    supportedEntities = ['LoanProcessingRun'];
    async fetchContext(entityId) {
        console.log(`[Intrepid Loan Engine Node] Loading tenant-scoped loan processing run context for: ${entityId}`);
        const mockRunPayload = {
            runId: entityId,
            tenantId: '11111111-1111-4111-8111-111111111111',
            status: 'SUCCEEDED',
            totalLoans: 2,
            loansWithExceptions: 1,
            balanceImpact: 1234.56,
            asOfDate: '2026-06-28'
        };
        return {
            entityId: mockRunPayload.runId,
            entityName: `Loan Processing Run ${mockRunPayload.runId}`,
            attributes: {
                entityType: 'LoanProcessingRun',
                tenantId: mockRunPayload.tenantId,
                status: mockRunPayload.status,
                totalLoans: mockRunPayload.totalLoans,
                loansWithExceptions: mockRunPayload.loansWithExceptions,
                balanceImpact: mockRunPayload.balanceImpact,
                asOfDate: mockRunPayload.asOfDate
            },
            relationships: [
                {
                    relation: 'HAS_LOAN_EXCEPTION',
                    targetEntity: `${mockRunPayload.tenantId}:${mockRunPayload.runId}:L1:RULE_X`,
                    sourceNode: 'Intrepid_Loan_Engine_Postgres',
                    metadata: {
                        ruleId: 'RULE_X',
                        exceptionType: 'UNDERWRITING',
                        severity: 'HIGH'
                    }
                },
                {
                    relation: 'HAS_PORTFOLIO_EXCEPTION',
                    targetEntity: `${mockRunPayload.tenantId}:${mockRunPayload.runId}:P_RULE_1`,
                    sourceNode: 'Intrepid_Loan_Engine_Postgres',
                    metadata: {
                        ruleId: 'P_RULE_1',
                        exceptionType: 'PORTFOLIO',
                        severity: 'MED'
                    }
                },
                {
                    relation: 'SOURCE_NODE',
                    targetEntity: 'Intrepid_Loan_Engine_Postgres',
                    sourceNode: 'Intrepid_Loan_Engine_Postgres',
                    metadata: {
                        tenantScoped: true,
                        rlsContextRequired: true
                    }
                }
            ]
        };
    }
}
