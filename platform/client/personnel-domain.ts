export type Scalar = number|string|null;
export interface Employee {
  matricule:string;nom:string;prenom?:string;dateEntree?:string;statut?:string;photo?:string|null;
  coutJour?:Scalar;tempsPartiel?:Scalar;payslip?:string;payslipName?:string;
  regime?:string;joursAnPartiel?:Scalar;brutAnnuel?:Scalar;brutRefYear?:Scalar;
  cpAcquis?:Scalar;cpEnCours?:Scalar;commentaire?:string;[key:string]:unknown;
}
export interface MovementType {code:string;libelle:string;categorie:string;signe:Scalar;compteCP:string;epargne:string;monetisation?:string;[key:string]:unknown;}
export interface Movement {id:string;date:string;matricule:string;type:string;qte:Scalar;statut:string;commentaire?:string;[key:string]:unknown;}
export interface EnrichedMovement extends Movement {sal?:Employee;libelle:string;categorie:string;qteSignee:number;montant:number|null;annee:number|null;}
export interface YearRow {sal:Employee;soldeFin:number;credits:number;debits:number;cpAffectes:number;alerteCP:boolean;alertePlafond:boolean;peiJ:number;perJ:number;}
export interface Parameters {entreprise:string;plafondGlobal:Scalar;plafondCPan:Scalar;anneeSuivi:Scalar;unite:string;dispositifs:string;[key:string]:unknown;}
export interface AccountSummary {email:string;name:string;admin:boolean;active:boolean;}
export interface MovementFilter {sal:string;type:string;cat:string;q:string;}
export type SortKey = 'date'|'sal'|'type'|'qte'|'statut'|'montant';
export interface MovementSort {key:SortKey;dir:'asc'|'desc';}
export type PersonnelView = 'cet'|'mouvements'|'salaries'|'parametres';
export interface PersonnelSnapshot {
 view:PersonnelView;admin:boolean;access:string|null;year:number;years:number[];hoursPerDay:number;
 employees:Employee[];types:MovementType[];movements:EnrichedMovement[];rows:YearRow[];params:Parameters;
 filter:MovementFilter;sort:MovementSort;accounts:AccountSummary[];cloud:boolean;
}
export type PersonnelAction = 'summary'|'movements'|'detail'|'newMovement'|'editMovement'|'deleteMovement'|'importCET'|'exportSummary'|'exportMovements'|'print'|'newEmployee'|'editEmployee'|'deleteEmployee'|'payslip'|'previewPayslip'|'removePayslip'|'newType'|'editType'|'deleteType'|'saveParams'|'backup'|'importJSON'|'migrateFiles'|'reset'|'addAccount'|'resetAccount'|'removeAccount';
export function filterMovements(source:EnrichedMovement[],year:number,access:string|null,filter:MovementFilter,sort:MovementSort){
 if(!access)return [];
 const query=filter.q.toLowerCase();
 const list=source.filter(m=>m.annee===year&&(access==='admin'?(!filter.sal||m.matricule===filter.sal):m.matricule===access)&&(!filter.type||m.type===filter.type)&&(!filter.cat||m.categorie===filter.cat)&&(!query||((m.sal?m.sal.nom+' '+(m.sal.prenom||''):'')+' '+m.libelle+' '+(m.commentaire||'')).toLowerCase().includes(query)));
 const value=(m:EnrichedMovement):string|number=>{switch(sort.key){case 'sal':return m.sal?m.sal.nom+' '+(m.sal.prenom||''):'zzz';case 'type':return m.libelle||m.type||'';case 'qte':return m.qteSignee;case 'statut':return m.statut||'';case 'montant':return m.montant==null?-Infinity:m.montant;default:return m.date||'';}};
 const dir=sort.dir==='asc'?1:-1;
 return list.sort((a,b)=>{const av=value(a),bv=value(b);if(typeof av==='number'&&typeof bv==='number')return (av-bv)*dir;const x=String(av).toLowerCase(),y=String(bv).toLowerCase();return (x<y?-1:x>y?1:0)*dir;});
}
export const days=(n:Scalar|undefined)=>n==null||n===''?'—':Number(n).toLocaleString('fr-FR',{maximumFractionDigits:2});
export const euros=(n:Scalar|undefined)=>n==null||n===''?'—':Number(n).toLocaleString('fr-FR',{maximumFractionDigits:0})+' €';
export const date=(d?:string)=>{if(!d)return '—';const [y,m,day]=String(d).split('-');return day+'/'+m+'/'+y;};
export const tone=(m:EnrichedMovement)=>(m.type||'').includes('AJUST')?'gray':m.categorie==='Alimentation'?'green':'orange';
