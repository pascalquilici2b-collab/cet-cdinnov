import type {Database, Reply, WorkspaceRow} from './contracts';
import {budgetCollections} from './contracts';
import {addClientNames, jsonBody} from '../server/legacy-runtime.mjs';
import {readRecordSource,saveRecordSource} from './record-writes';

const empty = '{"demo":false,"clients":[],"projects":[],"budgetLines":[],"expenses":[],"drs":[],"imports":[]}';

export async function readWorkspace(request: Request, db: Database, headers: Headers): Promise<Response> {
  const match = request.headers.get('if-none-match');
  if (match) {
    // Check the small revision first: unchanged reads never load the megabyte payload.
    const meta = await db.prepare("SELECT version FROM budgets_workspace WHERE id='shared'").first<{version:number}>();
    const tag = '"budgets-' + (meta?.version || 0) + '"';
    if (match === tag) { headers.set('ETag', tag); return new Response(null, {status:304, headers}); }
  }
  const row = await db.prepare("SELECT payload,version,updated_at,updated_by FROM budgets_workspace WHERE id='shared'").first<WorkspaceRow>();
  headers.set('ETag', '"budgets-' + (row?.version || 0) + '"');
  // payload is validated JSON at the existing write boundary. Do not parse and stringify it again.
  const metadata = JSON.stringify({version:row?.version || 0, updatedAt:row?.updated_at, updatedBy:row?.updated_by});
  return new Response('{"workspace":' + (row?.payload || empty) + ',' + metadata.slice(1), {headers});
}

export async function syncClientNames(request: Request, db: Database, email: string, reply: Reply): Promise<Response> {
  const {names} = await jsonBody(request,500000);
  if (!Array.isArray(names) || names.length > 10000 || names.some((n: unknown) => typeof n !== 'string' || n.length > 300))
    return reply(400,{error:'Liste de clients invalide.'});
  for (let attempt=0; attempt<4; attempt++) {
    const row=await readRecordSource(db,'budgets',JSON.parse(empty),0);
    const current = row.document.clients;
    const clients = addClientNames(current, names);
    const version = row.version;
    if (clients.length === current.length) return reply(200,{clients,version});
    const saved=await saveRecordSource(db,'budgets',row.document,{...row.document,clients},version,email,row.exists);
    if (saved!==null) return reply(200,{clients,version:saved});
  }
  return reply(409,{error:'Le répertoire est en cours de modification. Réessayez.'});
}

export async function readRecords(request: Request, db: Database, reply: Reply): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const collection = params.get('collection') || 'clients';
  const limit = Number(params.get('limit') || 50);
  const after = Number(params.get('after') || -1);
  const requestedVersion = params.get('version');
  if (!(budgetCollections as readonly string[]).includes(collection) || !Number.isInteger(limit) || limit<1 || limit>100 ||
      !Number.isSafeInteger(after) || after < -1 || (requestedVersion!==null && !/^\d+$/.test(requestedVersion)))
    return reply(400,{error:'Paramètres de pagination invalides.'});
  if (after>=0 && requestedVersion===null) return reply(428,{error:'Version requise pour continuer la lecture.'});
  // A single SQL snapshot joins revision and rows; a concurrent save cannot mix two pages silently.
  const result = await db.prepare(`SELECT w.version,r.position,r.payload FROM budgets_workspace w LEFT JOIN (
    SELECT position,payload FROM app_budget_records WHERE workspace_id='shared' AND collection=? AND position>? ORDER BY position LIMIT ?
  ) r ON 1=1 WHERE w.id='shared' ORDER BY r.position`).bind(collection,after,limit+1)
    .all<{version:number;position:number|null;payload:string|null}>();
  const version = result.results[0]?.version || 0;
  if (requestedVersion!==null && Number(requestedVersion)!==version) return reply(409,{error:'Le budget a changé. Rechargez la première page.'});
  const rows = result.results.filter(r=>r.payload!==null), more = rows.length>limit, page=rows.slice(0,limit);
  return reply(200,{collection,version,items:page.map(r=>JSON.parse(r.payload!)),next:more?{after:page.at(-1)!.position,version}:null});
}
