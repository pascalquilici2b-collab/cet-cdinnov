import type {ClientEmployee} from './client-employees-domain';
import type {RhDocumentStatus} from './rh-lifecycle';

export interface RhClientAgents {version:number;agents:ClientEmployee[];links:{agentId:string;projectId:string}[];}
export interface RhProjectAgent {id:string;name:string;role:string;clientId:string;clientName:string;}
/** Same-origin authenticated routes only; private storage keys never enter this index. */
export interface RhArchiveFile {id:string;filename:string;mime:string;createdAt:string;downloadPath:string;employeeId?:string;employeeName?:string;}
export interface RhArchivePayroll extends RhArchiveFile {
 employeeId:string;employeeName:string;month:string;confirmed:boolean;
 sources:{id:string;documentId:string;documentName:string;deleted:boolean;confirmed:boolean;downloadPath:string}[];
}
export interface RhArchiveReturn {id:string;revision:number;status:'received'|'validated';complete:boolean;createdAt:string;files:RhArchiveFile[];}
export interface RhArchiveVersion extends RhArchiveFile {revision:number;returns:RhArchiveReturn[];}
export interface RhArchivePaymentDocument {
 id:string;name:string;version:number;status:RhDocumentStatus;deleted:boolean;updatedAt:string;
 employeeIds:string[];projects:{id:string;name:string}[];periodStart:string;periodEnd:string;
 latestReturnStatus:'received'|'validated'|null;versions:RhArchiveVersion[];
}
export interface RhClientArchive {payroll:RhArchivePayroll[];missions:RhArchiveFile[];legacyPayments:RhArchiveFile[];payments:RhArchivePaymentDocument[];}
