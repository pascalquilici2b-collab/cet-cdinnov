/** Keep the lot's display name, with characters safe for a downloaded filename. */
export function stampedLotFilename(name:string){
 const lot=name.normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'-').replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,'').slice(0,140).trim()||'Lot';
 return lot+' tamponné.zip';
}

type ExportDocument={id:string;name:string;match_group?:string|null;data:any};
const safePart=(value:unknown,fallback:string)=>String(value||'').normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'-').replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,'').slice(0,95).trim()||fallback;
const identity=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').split(/[\s_-]+/).sort().join(' ');
const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

/** Use confirmed payroll identity; preserve invoice names for service/equipment lots. */
export function stampedDocumentNames(documents:ExportDocument[],groups:any[]=[]):Map<string,string>{
 const entries=documents.map(doc=>{
  const data=typeof doc.data==='string'?JSON.parse(doc.data):doc.data,fields=data.reading?.fields||{},group=groups.find(g=>g.id===(data.groupId||doc.match_group));
  const payroll=(group?.document_type||fields.document_type)==='PAYSLIP';
  const groupName=String(group?.employee_ref||'');
  const employee=safePart(/\p{L}{2,}\s+\p{L}{2,}/u.test(groupName)?groupName:fields.employee_name||groupName||fields.employee_ref,'Agent non identifié');
  const period=String(group?.period||fields.period||'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const month=period?months[Number(period[2])-1]+'_'+period[1]:'Mois_non_identifié';
  const name=payroll?'DR_EPCIC_RH_'+employee.replace(/\s+/g,'_')+'_'+month:safePart(doc.name.replace(/\.pdf$/i,''),'Pièce')+'_tamponné';
  return {doc,payroll,employee,name};
 });
 const employees=new Map<string,string>();for(const e of entries)if(e.payroll&&!employees.has(identity(e.employee)))employees.set(identity(e.employee),e.employee);
 const paths=new Set<string>(),result=new Map<string,string>();
 for(const e of entries){
  const folder=e.payroll&&employees.size>1?employees.get(identity(e.employee))+'/':'';
  const path=folder+e.name;let suffix='',n=1;
  while(paths.has((path+suffix+'.pdf').normalize('NFKC').toLowerCase()))suffix='_'+String(++n).padStart(2,'0');
  paths.add((path+suffix+'.pdf').normalize('NFKC').toLowerCase());result.set(e.doc.id,path+suffix+'.pdf');
 }
 return result;
}
