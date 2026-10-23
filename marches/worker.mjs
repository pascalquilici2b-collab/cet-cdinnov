import {handleAnalysis,handleReading,aiStatus} from './ai-worker.mjs';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {validateMarket,suggestFromText} from './domain.mjs';
import {quoteConsumption} from './tracking.mjs';

const MAX_FILE=5*1024*1024;
const MAX_MARKET=50*1024*1024;
const documentColumns='id,market_id,name,kind,mime,size,sha256,uploaded_at,uploaded_by,length(extracted_text) AS text_length';
const unpack=r=>({...JSON.parse(r.payload),id:r.id,version:r.version,updatedAt:r.updated_at,updatedBy:r.updated_by});
const doc=r=>({id:r.id,name:r.name,kind:r.kind,mime:r.mime,size:r.size,sha256:r.sha256,uploadedAt:r.uploaded_at,uploadedBy:r.uploaded_by,hasText:r.text_length>0});
const validId=s=>/^[a-zA-Z0-9_-]{1,80}$/.test(s);
async function bytes(request,max){
  let n=0;const parts=[];
  for await(const part of request.body||[]){n+=part.length;if(n>max)throw Object.assign(new Error('Pièce trop volumineuse : maximum 5 Mo par fichier.'),{status:413});parts.push(Buffer.from(part));}
  return Buffer.concat(parts);
}
function fileType(name,b){
  const ext=name.split('.').pop().toLowerCase();
  if(ext==='pdf'&&b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(['docx','xlsx'].includes(ext)&&b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4)return ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(ext==='png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(['jpg','jpeg'].includes(ext)&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(['txt','csv'].includes(ext)&&!b.includes(0))return 'text/plain';
  throw Object.assign(new Error('Format non reconnu. Utilisez PDF, DOCX, XLSX, PNG, JPG, TXT ou CSV.'),{status:415});
}
export async function handleMarkets(request,db,email,admin,reply,jsonBody,env={}){
  if(!admin)return reply(403,{error:'Le paramétrage des marchés est réservé à la direction habilitée.'});
  const parts=new URL(request.url).pathname.split('/').filter(Boolean).slice(2);
  const [id,section,documentId]=parts;
  if(parts.length>3||(id&&!validId(id))||(documentId&&!validId(documentId)))return reply(404,{error:'Ressource introuvable.'});
  const getDocs=async marketId=>(await db.prepare('SELECT '+documentColumns+' FROM market_documents WHERE market_id=? ORDER BY uploaded_at,id').bind(marketId).all()).results;
  if(!id){
    if(request.method==='GET'){
      const result=await db.prepare('SELECT * FROM markets ORDER BY updated_at DESC LIMIT 500').all();
      const directory=await db.prepare("SELECT record_id AS id,name FROM app_budget_records WHERE workspace_id='shared' AND collection='clients' ORDER BY position").all();
      const clients=directory.results;
      const consumption=await quoteConsumption(db);
      return reply(200,{markets:result.results.map(r=>({...unpack(r),tracking:consumption.get(r.id)||{sentQuoteCount:0,quotedMinor:0}})),clients});
    }
    if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
    const data=await jsonBody(request,1500000);
    if(!validId(data?.id))return reply(400,{error:'Identifiant de création requis.'});
    let market;try{market=validateMarket(data.market,[]);}catch(e){return reply(400,{error:e.message});}
    if(market.status!=='draft')return reply(400,{error:'Créez d’abord le marché en préparation, puis ajoutez ses pièces.'});
    const current=await db.prepare('SELECT * FROM markets WHERE id=?').bind(data.id).first();
    if(current)return JSON.stringify(JSON.parse(current.payload))===JSON.stringify(market)?reply(200,{market:unpack(current),documents:(await getDocs(data.id)).map(doc)}):reply(409,{error:'Cette création a déjà été enregistrée. Actualisez la liste.'});
    const stamp=new Date().toISOString();
    const row=await db.prepare('INSERT INTO markets(id,payload,version,updated_at,updated_by) VALUES(?,?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING *').bind(data.id,JSON.stringify(market),stamp,email).first();
    if(!row)return reply(409,{error:'Ce marché a déjà été créé. Actualisez la liste.'});
    return reply(201,{market:unpack(row),documents:[]});
  }
  if(id==='ai-status'&&!section&&request.method==='GET')return reply(200,await aiStatus(db,env));
  const current=await db.prepare('SELECT * FROM markets WHERE id=?').bind(id).first();
  if(!current)return reply(404,{error:'Marché introuvable.'});
  if(section==='reading'&&documentId)return await handleReading(request,db,email,current,documentId,reply,jsonBody);
  if(section==='analysis')return await handleAnalysis(request,db,email,current,documentId,reply,jsonBody,env);
  if(!section){
    if(request.method==='GET')return reply(200,{market:{...unpack(current),tracking:(await quoteConsumption(db)).get(id)||{sentQuoteCount:0,quotedMinor:0}},documents:(await getDocs(id)).map(doc)});
    if(request.method!=='PUT')return reply(405,{error:'Méthode non autorisée.'});
    const raw=request.headers.get('if-match');
    if(!raw||!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw)))return reply(428,{error:'Version de la fiche requise.'});
    const input=await jsonBody(request,1500000);
    // Older tabs do not know the project tree: omission must never delete it.
    if(input&&typeof input==='object'){
      const previous=JSON.parse(current.payload);
      for(const key of ['projects','startBasis','startDate','initialDurationMonths','maximumMinor'])
        if(!Object.hasOwn(input,key)&&Object.hasOwn(previous,key))input[key]=previous[key];
      if(Array.isArray(input.projects))for(const project of input.projects){
        const old=previous.projects?.find(p=>p.id===project?.id);
        for(const key of ['logoData','marketIds','clientIds'])if(old&&project&&!Object.hasOwn(project,key)&&Object.hasOwn(old,key))project[key]=old[key];
      }
    }
    let market;try{market=validateMarket(input,await getDocs(id));}catch(e){return reply(400,{error:e.message});}
    const row=await db.prepare('UPDATE markets SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? RETURNING *').bind(JSON.stringify(market),new Date().toISOString(),email,id,Number(raw)).first();
    if(!row)return reply(409,{error:'Un collègue a modifié ce marché. Votre saisie est conservée : exportez-la avant de recharger la fiche.'});
    return reply(200,{market:{...unpack(row),tracking:(await quoteConsumption(db)).get(id)||{sentQuoteCount:0,quotedMinor:0}},documents:(await getDocs(id)).map(doc)});
  }
  if(section==='history'&&!documentId&&request.method==='GET'){
    const rows=await db.prepare('SELECT version,payload,updated_at,updated_by FROM market_versions WHERE market_id=? ORDER BY version DESC LIMIT 100').bind(id).all();
    return reply(200,{versions:rows.results.map(r=>({version:r.version,market:JSON.parse(r.payload),updatedAt:r.updated_at,updatedBy:r.updated_by}))});
  }
  if(section!=='documents')return reply(404,{error:'Ressource introuvable.'});
  if(documentId){
    if(request.method!=='GET')return reply(405,{error:'Les pièces sources sont conservées sans remplacement.'});
    const row=await db.prepare('SELECT '+documentColumns+' FROM market_documents WHERE id=? AND market_id=?').bind(documentId,id).first();
    if(!row)return reply(404,{error:'Pièce introuvable dans ce marché.'});
    if(new URL(request.url).searchParams.has('analysis')){const extracted=await db.prepare('SELECT extracted_text FROM market_documents WHERE id=? AND market_id=?').bind(documentId,id).first();return reply(200,{text:extracted.extracted_text,suggestions:suggestFromText(extracted.extracted_text)});}
    const chunks=(await db.prepare('SELECT data FROM market_document_chunks WHERE document_id=? ORDER BY sequence').bind(documentId).all()).results;
    const body=Buffer.concat(chunks.map(c=>Buffer.from(c.data,'base64')));
    if(body.length!==row.size||createHash('sha256').update(body).digest('hex')!==row.sha256)return reply(503,{error:'Contrôle d’intégrité de la pièce non satisfait. Contactez le responsable.'});
    const headers=new Headers(reply(200,{}).headers);
    headers.set('Content-Type',row.mime);
    headers.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(row.name));
    headers.set('Content-Security-Policy',"sandbox");
    return new Response(body,{headers});
  }
  if(request.method==='GET')return reply(200,{documents:(await getDocs(id)).map(doc)});
  if(request.method!=='POST')return reply(405,{error:'Méthode non autorisée.'});
  if(JSON.parse(current.payload).status==='archived')return reply(409,{error:'Le marché archivé ne peut plus recevoir de nouvelles pièces.'});
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return reply(415,{error:'Fichier multipart requis.'});
  const body=await bytes(request,MAX_FILE+700000);
  let form;try{form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();}catch{return reply(400,{error:'Envoi de fichier invalide.'});}
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>MAX_FILE)return reply(400,{error:'Choisissez une pièce non vide de 5 Mo maximum.'});
  const content=Buffer.from(await file.arrayBuffer());
  const name=file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,220)||'piece';
  const mime=fileType(name,content);
  const kind=String(form.get('kind')||'other');
  if(!['ae','price','clauses','notification','amendment','renewal','offer','order','other'].includes(kind))return reply(400,{error:'Nature de pièce invalide.'});
  const extracted=String(form.get('text')||'').slice(0,150000);
  const hash=createHash('sha256').update(content).digest('hex');
  const existing=await db.prepare('SELECT '+documentColumns+' FROM market_documents WHERE market_id=? AND sha256=?').bind(id,hash).first();
  if(existing)return reply(200,{document:doc(existing),duplicate:true});
  const total=await db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM market_documents WHERE market_id=?').bind(id).first();
  if(total.count>=50||total.bytes+content.length>MAX_MARKET)return reply(413,{error:'Limite atteinte : 50 pièces ou 50 Mo par marché.'});
  const did=crypto.randomUUID(),stamp=new Date().toISOString();
  const statements=[db.prepare('INSERT INTO market_documents(id,market_id,name,kind,mime,size,sha256,uploaded_at,uploaded_by,extracted_text) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(did,id,name,kind,mime,content.length,hash,stamp,email,extracted)];
  for(let offset=0,seq=0;offset<content.length;offset+=131072,seq++)statements.push(db.prepare('INSERT INTO market_document_chunks(document_id,sequence,data) VALUES(?,?,?)').bind(did,seq,content.subarray(offset,offset+131072).toString('base64')));
  try{await db.batch(statements);}catch(error){
    if(error.message?.includes('market_document_quota'))return reply(413,{error:'Limite atteinte : 50 pièces ou 50 Mo par marché.'});
    if(error.message?.includes('market_archived'))return reply(409,{error:'Le marché vient d’être archivé. La pièce n’a pas été ajoutée.'});
    const duplicate=await db.prepare('SELECT '+documentColumns+' FROM market_documents WHERE market_id=? AND sha256=?').bind(id,hash).first();
    if(duplicate)return reply(200,{document:doc(duplicate),duplicate:true});
    throw error;
  }
  return reply(201,{document:{id:did,name,kind,mime,size:content.length,sha256:hash,uploadedAt:stamp,uploadedBy:email,hasText:!!extracted},suggestions:suggestFromText(extracted)});
}
