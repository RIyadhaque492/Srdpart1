/**
 * Collection "Particulars" values seen in the workbook, split by what they do
 * to a loan. Only cash types move a portfolio's Total Collected / Outstandings
 * when a collection is recorded in the app; the rest are adjustments that the
 * workbook books separately and that stay read-only here.
 */
export const CASH_TYPES = [
  'Regular Collection',
  'Due Collection',
  'Settlement Collection',
  'Legal Collection',
] as const;

export const ADJUSTMENT_TYPES = [
  'DDBS',
  'Waive Off',
  'EAdj-Marketing Exp',
  'Contingency Adjustment',
  'Adjustment Loan Settlement',
  'Recovery Adjustment',
  'Additional SC',
] as const;

export const isCash = (p: string | null | undefined) =>
  !!p && (CASH_TYPES as readonly string[]).includes(p);
