import type {BillingAnnotation} from './billing-contracts';
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:422});};
/** Integer coordinates are fractions of an A4 page (0–10000), independent of viewer zoom. */
export function normalizeAnnotations(raw:unknown):BillingAnnotation[]{
 if(!Array.isArray(raw)||raw.length>80)return fail('Le document accepte au maximum 80 ajouts.');
 const seen=new Set<string>();let total=0;
 return raw.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('Ajout PDF invalide.');
  const v=value as Record<string,unknown>,text=v.kind==='text';
  if(!['text','highlight'].includes(String(v.kind))||Object.keys(v).some(k=>!['id','kind','page','x','y','width','height','color',...(text?['text','fontSize']:[])].includes(k)))return fail('Type d’ajout PDF invalide.');
  if(typeof v.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)||seen.has(v.id.toLowerCase()))return fail('Identifiant d’ajout PDF invalide ou en double.');
  const id=v.id.toLowerCase();seen.add(id);
  for(const k of ['page','x','y','width','height'])if(!Number.isSafeInteger(v[k]))return fail('Position de l’ajout PDF invalide.');
  const {page,x,y,width,height}=v as unknown as BillingAnnotation;
  if(page<1||page>100||x<0||y<0||width<100||height<80||x+width>10000||y+height>10000)return fail('L’ajout doit rester à l’intérieur de la page.');
  const box={id,page,x,y,width,height};
  if(!text){if(!['yellow','blue','green'].includes(String(v.color)))return fail('Couleur du surlignage invalide.');return {...box,kind:'highlight',color:v.color} as BillingAnnotation;}
  if(!['ink','blue','red'].includes(String(v.color))||!Number.isSafeInteger(v.fontSize)||Number(v.fontSize)<8||Number(v.fontSize)>24)return fail('Style du texte invalide.');
  if(typeof v.text!=='string'||!v.text.trim()||v.text.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v.text))return fail('Le texte doit contenir entre 1 et 2 000 caractères.');
  const content=v.text.normalize('NFC');total+=content.length;if(total>20000)return fail('Les ajouts dépassent 20 000 caractères.');
  return {...box,kind:'text',color:v.color,text:content,fontSize:v.fontSize} as BillingAnnotation;
 });
}
