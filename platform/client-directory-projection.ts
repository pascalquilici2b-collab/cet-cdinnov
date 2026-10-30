import type {Database} from './contracts';

type BudgetClientRow={data_json:string};
type DirectoryClientRow={id:string;data_json:string};

/** Current names for selectors; budget records and issued document snapshots remain untouched. */
export function clientDirectoryChoices(budgetRows:BudgetClientRow[],directoryRows:DirectoryClientRow[],includeArchived=false,includeLegalIdentity=false){
 const clients=new Map<string,{id:string;name:string;siret?:string;siren?:string}>();
 for(const row of budgetRows){const data=JSON.parse(row.data_json);if(typeof data.id==='string'&&typeof data.name==='string'&&data.name.trim())clients.set(data.id,{id:data.id,name:data.name});}
 for(const row of directoryRows){
  const data=JSON.parse(row.data_json);
  if(data.archived&&!includeArchived){clients.delete(row.id);continue;}
  if(typeof data.party?.name==='string'&&data.party.name.trim())clients.set(row.id,{id:row.id,name:data.party.name,...(includeLegalIdentity?{siret:typeof data.party.siret==='string'?data.party.siret:'',siren:typeof data.party.siren==='string'?data.party.siren:''}:{})});
 }
 return [...clients.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')||a.id.localeCompare(b.id));
}

export async function readClientDirectoryChoices(db:Database,includeLegalIdentity=false){
 const available=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='billing_directory'").first();
 const [budget,directory]=await Promise.all([
  db.prepare('SELECT data_json FROM budget_clients').all<BudgetClientRow>(),
  available?db.prepare("SELECT id,data_json FROM billing_directory WHERE kind='clients'").all<DirectoryClientRow>():Promise.resolve({results:[]})
 ]);
 return clientDirectoryChoices(budget.results,directory.results,false,includeLegalIdentity);
}
