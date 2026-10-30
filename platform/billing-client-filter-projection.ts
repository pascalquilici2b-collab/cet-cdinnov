import type {Database} from './contracts';
import {createClientFilterResolver,type FilterClient,type ClientIdentityInput} from './billing-client-filter-identity';
import {historicalClientFilterNames} from './billing-client-filter-aliases';
const key=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const string=(v:unknown)=>typeof v==='string'?v:'';
type NativeIdentity=ClientIdentityInput&{id:string;kind:string;trashed:number};
type ImportedIdentity=ClientIdentityInput&{id:string;marketId?:string};
/** Shared read projection. Original IDs, snapshots and market links are never rewritten. */
export async function clientFilterProjection(db:Database,kind:string|null,trash:boolean){
 const [directory,history,budget,native,imported,markets]=await Promise.all([
  db.prepare("SELECT id,json_extract(data_json,'$.party') party FROM billing_directory WHERE kind='clients'").all<{id:string;party:string}>(),
  db.prepare("SELECT id,json_extract(data_json,'$.party.name') name FROM billing_directory_versions WHERE kind='clients'").all<{id:string;name:string}>(),
  db.prepare("SELECT json_extract(data_json,'$.id') id,json_extract(data_json,'$.name') name,json_extract(data_json,'$.aliases') aliases,(SELECT json_group_array(json(a.data_json)) FROM budget_client_aliases a WHERE a.parent_key=budget_clients.record_key) childAliases FROM budget_clients").all<{id:string;name:string;aliases:string|null;childAliases:string}>(),
  db.prepare(`SELECT id,kind,EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=billing_documents.id) trashed,json_extract(data_json,'$.clientId') clientId,json_extract(data_json,'$.buyer.name') name,json_extract(data_json,'$.buyer.siret') siret,json_extract(data_json,'$.buyer.siren') siren FROM billing_documents`).all<NativeIdentity>(),
  kind==='invoice'&&!trash?db.prepare("SELECT json_extract(data_json,'$.id') id,json_extract(data_json,'$.client') name,json_extract(data_json,'$.clientId') clientId,coalesce(json_extract(data_json,'$.siret'),json_extract(data_json,'$.buyer.siret')) siret,coalesce(json_extract(data_json,'$.siren'),json_extract(data_json,'$.buyer.siren')) siren,json_extract(data_json,'$.marketId') marketId FROM portal_invoices").all<ImportedIdentity>():Promise.resolve({results:[] as ImportedIdentity[]}),
  db.prepare("SELECT id,json_extract(payload,'$.clientId') clientId,json_extract(payload,'$.clientName') name FROM markets").all<{id:string;clientId:string;name:string}>()
 ]);
 const clients=new Map<string,FilterClient>();
 for(const c of budget.results)if(c.id&&c.name)clients.set(c.id,{id:c.id,name:c.name,aliases:[...JSON.parse(c.aliases||'[]'),...JSON.parse(c.childAliases||'[]')].filter(a=>typeof a==='string')});
 for(const c of directory.results){const p=JSON.parse(c.party||'{}'),previous=clients.get(c.id);clients.set(c.id,{id:c.id,name:string(p.name)||previous?.name||'',siret:string(p.siret),siren:string(p.siren),aliases:[...(previous?.aliases||[]),...(previous?.name?[previous.name]:[])]});}
 for(const old of [...history.results,...markets.results.map(m=>({id:m.clientId,name:m.name}))]){const c=clients.get(old.id);if(c&&old.name)c.aliases=[...c.aliases||[],old.name];}
 // Connect an explicit alias group only when exactly one current directory entity matches it.
 for(const aliases of historicalClientFilterNames){const names=new Set(aliases.map(key)),matches=[...clients.values()].filter(c=>[c.name,...c.aliases||[]].some(n=>names.has(key(n))));if(matches.length===1)matches[0].aliases=[...matches[0].aliases||[],...aliases];}
 // A market link can identify a legacy import only when it carries no conflicting legal identifier.
 const importedIdentity=(c:ImportedIdentity)=>{
  const market=markets.results.find(m=>m.id===c.marketId),candidate=clients.get(market?.clientId||'');
  const digits=(v:unknown)=>string(v).replace(/[\s.\-]/g,''),siret=digits(c.siret),siren=digits(c.siren)||siret.slice(0,9);
  const knownSiret=digits(candidate?.siret),knownSiren=digits(candidate?.siren)||knownSiret.slice(0,9);
  const conflict=!!(siret&&knownSiret&&siret!==knownSiret||siren&&knownSiren&&siren!==knownSiren);
  const supported=!siret&&!siren||!!(siret&&knownSiret===siret||!siret&&siren&&knownSiren===siren);
  return {...c,clientId:c.clientId||(!conflict&&supported?candidate?.id:undefined)};
 };
 const imports=imported.results.map(importedIdentity),resolve=createClientFilterResolver([...clients.values()],[...native.results,...imports]);
 const nativeMap=native.results.filter(c=>(!kind||c.kind===kind)&&Boolean(c.trashed)===trash).map(c=>({id:c.id,...resolve(c)}));
 const importMap=Object.fromEntries(imports.map(c=>[c.id,resolve(c).value]));
 const options=new Map(nativeMap.filter(c=>c.label&&c.value!=='name:').map(c=>[c.value,{value:c.value,label:c.label}]));
 for(const c of imports){const option=resolve(c);if(option.label&&option.value!=='name:')options.set(option.value,option);}
 return {native:nativeMap,imported:importMap,clients:[...options.values()].sort((a,b)=>a.label.localeCompare(b.label,'fr'))};
}
