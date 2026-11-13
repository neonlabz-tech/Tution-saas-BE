export const INCOME_CATEGORIES = [
  'Tuition fees',
  'Registration fees',
  'Exam fees',
  'Other income',
] as const;

export const EXPENSE_CATEGORIES = [
  'Electricity bills',
  'Lecturer fees',
  'Internet bills',
  'Rent',
  'Equipment',
  'Maintenance',
  'Other expenses',
] as const;

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Card (front desk)',
] as const;

export const FINANCE_PERIODS = ['week', 'month', 'year', 'custom'] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type FinancePeriod = (typeof FINANCE_PERIODS)[number];
