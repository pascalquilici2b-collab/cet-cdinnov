export interface Member {id:string; name:string; email:string;}
export interface Leave {
  id:string; memberId:string; name:string; type:string; status:string;
  start:string; end:string; days:number; startHalf:string; endHalf:string;
}
export interface Trip {id:string; title:string; location:string; start:string; end:string; memberIds:string[];}
export interface DocumentSummary {
  id:string; number:string; label:string; date:string; dateSource:'created'|'document';
  amount:number; status:string;
}
export interface DashboardData {
  generatedAt:string; weekStart:string; today:string; admin:boolean;
  members:Member[]; leaves:Leave[]; trips:Trip[];
  counts:{leaveToday:number; travelToday:number; pending:number};
  pending:Leave[]; invoices:DocumentSummary[]|null; expenses:DocumentSummary[];
}
export type DashboardAction = {kind:'agenda'|'pending'|'invoice'|'expense'|'invoices'|'expenses'; id?:string; date?:string; memberId?:string};
