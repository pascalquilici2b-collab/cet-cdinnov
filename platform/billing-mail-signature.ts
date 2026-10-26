import type {Database,Reply} from './contracts';
import {boundedBody} from './portal';
import {normalizeSignature,emptySignature} from './billing-mail-content';
export async function mailSignatureRoute(request:Request,db:Database,email:string,reply:Reply){
 const owner=email.trim().toLowerCase(),read=async()=>{const row=await db.prepare('SELECT version,data_json FROM billing_mail_signatures WHERE owner=?').bind(owner).first<{version:number;data_json:string}>();return row?{version:row.version,data:normalizeSignature(JSON.parse(row.data_json))}:{version:0,data:emptySignature()};};
 if(request.method==='GET')return reply(200,await read());
 if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
 const version=request.headers.get('if-match');if(version===null||!/^(0|[1-9]\d*)$/.test(version))return reply(428,{error:'Version de signature requise.'});
 let data;try{const p=JSON.parse(new TextDecoder().decode(await boundedBody(request,750000)));if(Object.keys(p).join()!=='data')throw Error('Champs invalides.');data=normalizeSignature(p.data);}catch(e){return reply(400,{error:e instanceof Error?e.message:'Signature invalide.'});}
 const updated=Number(version)===0?await db.prepare('INSERT INTO billing_mail_signatures(owner,version,data_json,updated_at) VALUES(?,1,?,?) ON CONFLICT(owner) DO NOTHING RETURNING version').bind(owner,JSON.stringify(data),new Date().toISOString()).first():await db.prepare('UPDATE billing_mail_signatures SET version=version+1,data_json=?,updated_at=? WHERE owner=? AND version=? RETURNING version').bind(JSON.stringify(data),new Date().toISOString(),owner,Number(version)).first();
 if(!updated)return reply(409,{error:'La signature a changé dans une autre session. Rouvrez-la avant de modifier.'});return reply(200,await read());
}
