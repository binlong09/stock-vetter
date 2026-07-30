// Canonical concept → us-gaap tag mappings for the forensic ratio set.
//
// Every concept lists several tags, and that is not defensive padding — it is
// the whole difficulty. Filers migrate tags, and a series built from a single
// tag has a hole exactly where the migration happened. ASC 606 moved most of
// the market off `Revenues` in 2018; a revenue series keyed only on that tag
// shows a large company's sales going to zero and then reappearing, which any
// trend detector will happily report as a collapse and a recovery.
//
// Tags are listed most-specific first. `collectRawValues` merges across all of
// them and the per-period dedupe keeps the most recently filed value, so
// listing a tag a company doesn't use costs nothing.

import type { ConceptSpec } from '@stock-vetter/core';

export const FORENSIC_CONCEPTS: ConceptSpec[] = [
  // --- income statement (duration) ---
  {
    concept: 'revenue',
    kind: 'duration',
    tags: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
      'SalesRevenueServicesNet',
    ],
  },
  {
    concept: 'costOfRevenue',
    kind: 'duration',
    tags: [
      'CostOfGoodsAndServicesSold',
      'CostOfRevenue',
      'CostOfGoodsSold',
      'CostOfServices',
    ],
  },
  { concept: 'grossProfit', kind: 'duration', tags: ['GrossProfit'] },
  {
    concept: 'sga',
    kind: 'duration',
    tags: [
      'SellingGeneralAndAdministrativeExpense',
      'GeneralAndAdministrativeExpense',
    ],
  },
  { concept: 'operatingIncome', kind: 'duration', tags: ['OperatingIncomeLoss'] },
  { concept: 'netIncome', kind: 'duration', tags: ['NetIncomeLoss', 'ProfitLoss'] },
  {
    concept: 'incomeContinuingOps',
    kind: 'duration',
    tags: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperations',
    ],
  },
  {
    concept: 'depreciationAmortization',
    kind: 'duration',
    tags: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAndAmortization',
      'Depreciation',
    ],
  },
  {
    concept: 'stockCompensation',
    kind: 'duration',
    tags: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
  },
  {
    concept: 'cfo',
    kind: 'duration',
    tags: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
  },
  {
    concept: 'capex',
    kind: 'duration',
    tags: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
      'PaymentsForCapitalImprovements',
    ],
  },
  {
    concept: 'dilutedShares',
    kind: 'duration',
    unit: 'shares',
    tags: [
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      'WeightedAverageNumberOfDilutedSharesOutstandingAdjustment',
    ],
  },

  // --- balance sheet (instant) ---
  {
    concept: 'accountsReceivable',
    kind: 'instant',
    tags: [
      'AccountsReceivableNetCurrent',
      'ReceivablesNetCurrent',
      'AccountsReceivableGrossCurrent',
    ],
  },
  {
    concept: 'inventory',
    kind: 'instant',
    tags: ['InventoryNet', 'InventoryFinishedGoodsNetOfReserves', 'InventoryGross'],
  },
  {
    concept: 'accountsPayable',
    kind: 'instant',
    tags: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'],
  },
  { concept: 'totalAssets', kind: 'instant', tags: ['Assets'] },
  { concept: 'currentAssets', kind: 'instant', tags: ['AssetsCurrent'] },
  { concept: 'currentLiabilities', kind: 'instant', tags: ['LiabilitiesCurrent'] },
  { concept: 'totalLiabilities', kind: 'instant', tags: ['Liabilities'] },
  {
    concept: 'equity',
    kind: 'instant',
    tags: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
  { concept: 'retainedEarnings', kind: 'instant', tags: ['RetainedEarningsAccumulatedDeficit'] },
  {
    concept: 'ppeNet',
    kind: 'instant',
    tags: ['PropertyPlantAndEquipmentNet'],
  },
  { concept: 'goodwill', kind: 'instant', tags: ['Goodwill'] },
  {
    concept: 'intangibles',
    kind: 'instant',
    tags: ['FiniteLivedIntangibleAssetsNet', 'IntangibleAssetsNetExcludingGoodwill'],
  },
  {
    concept: 'cash',
    kind: 'instant',
    tags: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  {
    concept: 'longTermDebt',
    kind: 'instant',
    tags: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
  },
  {
    concept: 'shortTermDebt',
    kind: 'instant',
    tags: [
      'LongTermDebtCurrent',
      'ShortTermBorrowings',
      'DebtCurrent',
      'LongTermDebtAndCapitalLeaseObligationsCurrent',
    ],
  },
  {
    concept: 'deferredRevenue',
    kind: 'instant',
    tags: [
      'ContractWithCustomerLiabilityCurrent',
      'DeferredRevenueCurrent',
      'ContractWithCustomerLiability',
    ],
  },
];
