import { DarkFactoryEngine } from '../core/factory.js';

async function runRigEvaluation() {
  console.log('====== STARTING SYSTEM TEST HARNESS (DARK FACTORY PROTOCOL) ======');
  const factory = new DarkFactoryEngine();

  try {
    await factory.bootAssemblyLines();

    console.log('\n[Testing Route A: CRM]');
    const crmResult = await factory.queryContext('enterprise_crm_slice', 'cust_aws_10022');
    console.log('Result verification check:', JSON.stringify(crmResult, null, 2));

    console.log('\n[Testing Route B: Financial Ledger]');
    const ledgerResult = await factory.queryContext('divisional_financial_ledger', 'acct_azure_77331');
    console.log('Result verification check:', JSON.stringify(ledgerResult, null, 2));

    console.log('\n[Testing Route C: Intrepid Loan Engine]');
    const intrepidResult = await factory.queryContext('intrepid_loan_engine', 'INTREPID_RUN_2026_Q2_001');
    console.log('Result verification check:', JSON.stringify(intrepidResult, null, 2));
    console.log('\n✅ EVALUATION SUCCESS: All architectural integration constraints met cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ EVALUATION FAILURE: Code compilation schema violation or exception occurred.');
    console.error(error);
    process.exit(1);
  }
}

runRigEvaluation();