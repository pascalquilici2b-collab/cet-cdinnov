export type ClientIdentityInput={clientId?:string;name:string;siret?:string;siren?:string};
export type FilterClient={id:string;name:string;siret?:string;siren?:string;aliases?:string[];historicalIds?:string[]};
export type ClientFilterIdentity={value:string;label:string};

export const clientFilterNameKey=(value:string)=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const identifier=(value:string|undefined,length:number)=>{const result=String(value||'').replace(/[\s.\-]/g,'');return new RegExp('^\\d{'+length+'}$').test(result)?result:'';};
const identity=(value:{siret?:string;siren?:string})=>{const siret=identifier(value.siret,14);return {siret,siren:siret.slice(0,9)||identifier(value.siren,9)};};
const label=(value:string)=>String(value||'').trim().replace(/\s+/g,' ');
const clientId=(value:unknown)=>typeof value==='string'?value.trim():'';
type Client=FilterClient&{siret:string;siren:string};
type Index=Map<string,Set<Client>>;
const add=(index:Index,key:string,client:Client)=>{if(!key)return;const set=index.get(key)||new Set<Client>();set.add(client);index.set(key,set);};
const unique=(values:Set<Client>|undefined)=>values?.size===1?[...values][0]:undefined;
const consistent=(input:ClientIdentityInput,client:Client)=>{
 const ids=identity(input);
 return !(ids.siret&&client.siret&&ids.siret!==client.siret)&&!(ids.siren&&client.siren&&ids.siren!==client.siren);
};

/** Read-only identity projection. Only exact, unambiguous evidence joins historical labels. */
export function createClientFilterResolver(clients:FilterClient[],observations:ClientIdentityInput[]=[]):(input:ClientIdentityInput)=>ClientFilterIdentity{
 const current=new Map<string,Client>(),history:Index=new Map(),sirets:Index=new Map(),sirens:Index=new Map(),names:Index=new Map();
 for(const input of clients){
  const id=clientId(input.id);if(!id||current.has(id))continue;
  current.set(id,{...input,id,name:label(input.name),...identity(input),aliases:Array.isArray(input.aliases)?[...input.aliases]:[],historicalIds:Array.isArray(input.historicalIds)?input.historicalIds.map(clientId).filter(Boolean):[]});
 }
 for(const client of current.values()){
  for(const id of client.historicalIds||[])add(history,id,client);
  add(sirets,client.siret,client);add(sirens,client.siren,client);
  for(const name of [client.name,...client.aliases||[]])add(names,clientFilterNameKey(name),client);
 }
 const strong=(input:ClientIdentityInput):Client|undefined=>{
  const id=clientId(input.clientId);if(id){const known=current.get(id)||unique(history.get(id));if(known)return known;}
  const ids=identity(input);
  if(ids.siret){const candidates=sirets.get(ids.siret);if(candidates?.size)return unique(candidates);}
  if(ids.siren){
   // Do not guess an establishment from its parent legal entity when several are known.
   const candidate=unique(sirens.get(ids.siren));if(candidate&&consistent(input,candidate))return candidate;
  }
 };
 for(const input of observations){
  const known=strong(input);
  // An authoritative clientId wins for filtering, but contradictory snapshots cannot teach aliases.
  if(known&&consistent(input,known))add(names,clientFilterNameKey(input.name),known);
 }
 const resolve=(input:ClientIdentityInput)=>{
  const known=strong(input);if(known)return {client:known,value:'id:'+known.id,label:known.name};
  const ids=identity(input),id=clientId(input.clientId),name=clientFilterNameKey(input.name),candidate=unique(names.get(name));
  const ambiguousLegal=(ids.siret&&(sirets.get(ids.siret)?.size||0)>1)||(ids.siren&&(sirens.get(ids.siren)?.size||0)>1);
  // An unknown opaque ID cannot be reassigned on its name alone. Callers may supply proved historicalIds.
  if(candidate&&!id&&!ambiguousLegal&&consistent(input,candidate))return {client:candidate,value:'id:'+candidate.id,label:candidate.name};
  const value=ids.siret?'siret:'+ids.siret:ids.siren?'siren:'+ids.siren:id?'id:'+id:'name:'+name;
  return {client:undefined,value,label:label(input.name)||'Client'};
 };
 const labels=new Map<string,Set<string>>();
 const note=(value:string,text:string)=>{const key=clientFilterNameKey(text),set=labels.get(key)||new Set<string>();set.add(value);labels.set(key,set);};
 for(const client of current.values())note('id:'+client.id,client.name);
 for(const input of observations){const found=resolve(input);note(found.value,found.label);}
 return input=>{
  const found=resolve(input),duplicates=labels.get(clientFilterNameKey(found.label));
  const ambiguous=!!duplicates&&(duplicates.size>1||!duplicates.has(found.value));
  if(!ambiguous)return {value:found.value,label:found.label};
  const ids=found.client||identity(input),id=clientId(input.clientId),suffix=ids.siret?'SIRET '+ids.siret:ids.siren?'SIREN '+ids.siren:found.client?'ID '+found.client.id:id?'ID '+id:'sans identifiant';
  return {value:found.value,label:found.label+' — '+suffix};
 };
}
