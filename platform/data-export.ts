import type {Environment,Reply} from './contracts';
import {sessionIdentity} from './identity';
import {Buffer} from 'node:buffer';
export const exportSections={billing:'Devis et factures',clients:'Clients et salariés',markets:'Marchés et projets',budgets:'Budgets',sheets:'CDInnovSheets',stamping:'Tamponnage',expenses:'Notes de frais',leave:'Congés et déplacements',employees:'Salariés et CET',settings:'Paramètres',other:'Autres pièces'};
type Section=keyof typeof exportSections;
export function tableSection(name:string):Section|null{
 if(/^(billing_directory|budget_clients|budget_client_accounts|budget_client_aliases|client_employee)/.test(name))return 'clients';
 if(/^(billing_|portal_invoice|portal_factur)/.test(name))return 'billing';
 if(/^(market|commercial_project|portal_business_code)/.test(name))return 'markets';
 if(/^(budget_|app_budgets_meta)/.test(name))return 'budgets';
 if(/^(sheet_|app_sheets_meta)/.test(name))return 'sheets';
 if(/^stamp_/.test(name))return 'stamping';
 if(/^portal_expense/.test(name))return 'expenses';
 if(/^portal_leaves/.test(name))return 'leave';
 if(/^portal_(employees|cet_|movement_)/.test(name))return 'employees';
 if(/^(portal_settings|app_portal_meta|portal_accounts|portal_allowed_accounts|app_domain_state)$/.test(name))return 'settings';
 return null;
}
export async function dataExport(request:Request,env:Environment,reply:Reply){
 const session=await sessionIdentity(request,env);if(!session)return reply(401,{error:'Connexion requise.'});if(!session.admin)return reply(403,{error:'Export réservé aux administrateurs.'});
 if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
 const db=env.BUDGETS_DB.withSession('first-primary'),url=new URL(request.url),action=url.searchParams.get('action'),bucket=env.CET_FILES as any;
 const tables=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all<{name:string;sql:string}>()).results.filter(t=>tableSection(t.name)&&/^[a-z_]+$/.test(t.name));
 if(!action)return reply(200,{sections:exportSections,tables:tables.map(t=>({name:t.name,section:tableSection(t.name),schema:t.sql})),exportedAt:new Date().toISOString()});
 if(action==='data'){
  const name=url.searchParams.get('table')||'',offset=Number(url.searchParams.get('offset')||'0');if(!tables.some(t=>t.name===name)||!Number.isSafeInteger(offset)||offset<0)return reply(400,{error:'Table ou pagination invalide.'});
  const primary=(await db.prepare('PRAGMA table_info("'+name+'")').all<{name:string;pk:number}>()).results.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>'"'+c.name.replaceAll('"','""')+'"');
  const limit=/^(market_document_chunks|client_employee|billing_documents|billing_document_versions|billing_directory)/.test(name)?2:25;
  const rows=(await db.prepare('SELECT * FROM "'+name+'" ORDER BY '+(primary.join(',')||'rowid')+' LIMIT ? OFFSET ?').bind(limit,offset).all<any>()).results;
  // Account roles and access rights are exported, never password verifiers or invitation secrets.
  if(name==='portal_accounts')for(const row of rows){const data=JSON.parse(row.data_json||'{}');row.data_json=JSON.stringify({name:data.name,created:data.created,role:data.role,access:data.access});}
  return reply(200,{rows,nextOffset:rows.length===limit?offset+limit:null});
 }
 if(action==='files'){
  if(!bucket)return reply(200,{files:[],cursor:null});
  const result=await bucket.list({limit:500,...(url.searchParams.get('cursor')?{cursor:url.searchParams.get('cursor')}:{})});return reply(200,{files:result.objects.map((o:any)=>({key:o.key,size:o.size})),cursor:result.truncated?result.cursor:null});
 }
 if(action==='file'){
  const key=url.searchParams.get('key');if(!key||key.length>1000||/[\x00-\x1f]/.test(key))return reply(400,{error:'Pièce invalide.'});const file=await bucket?.get(key);if(!file)return reply(404,{error:'Pièce indisponible.'});
  const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',file.httpMetadata?.contentType||'application/octet-stream');headers.set('Content-Disposition','attachment');headers.set('Content-Security-Policy',"sandbox; default-src 'none'");return new Response(file.body,{headers});
 }
 if(action==='market-file'){
  const id=url.searchParams.get('id'),meta=await db.prepare('SELECT name,mime FROM market_documents WHERE id=?').bind(id).first<any>();if(!meta)return reply(404,{error:'Pièce introuvable.'});
  const chunks=(await db.prepare('SELECT data FROM market_document_chunks WHERE document_id=? ORDER BY sequence').bind(id).all<any>()).results;
  const headers=new Headers(reply(200,{}).headers);headers.set('Content-Type',meta.mime);headers.set('Content-Disposition','attachment');return new Response(new Blob(chunks.map(c=>new Uint8Array(Buffer.from(c.data,'base64')))),{headers});
 }
 return reply(400,{error:'Export invalide.'});
}
