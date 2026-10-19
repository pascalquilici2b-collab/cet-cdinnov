/** Small structural interfaces keep business modules independent of a provider SDK. */
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
}
export interface Database { prepare(sql: string): Statement; batch(statements:Statement[]):Promise<unknown>; }
export interface Environment {
  BUDGETS_DB: Database & {withSession(mode: string): Database};
  BUDGETS_ALLOWED_ORIGINS?: string;
  [binding: string]: unknown;
}
export type Reply = (status: number, body: unknown) => Response;
export interface WorkspaceRow {payload: string; version: number; updated_at: string; updated_by: string;}
export const budgetCollections = ['clients','projects','budgetLines','expenses','drs','imports','partnerReports'] as const;
