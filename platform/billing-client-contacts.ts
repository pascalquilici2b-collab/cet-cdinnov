import type {BillingClientContact} from './billing-contracts';

export function normalizeClientContacts(raw:unknown):BillingClientContact[]{
 const fail=():never=>{throw Object.assign(new Error('Chaque contact doit avoir un nom et une adresse e-mail valides (30 contacts maximum).'),{status:422});};
 if(!Array.isArray(raw)||raw.length>30)return fail();
 const ids=new Set<string>();
 return raw.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','name','email','role'].includes(k)))return fail();
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)||ids.has(v.id))return fail();
  ids.add(v.id);
  for(const [key,max] of [['name',160],['email',254],['role',120]] as const)if(typeof v[key]!=='string'||v[key].length>max||/[\x00-\x1f\x7f]/.test(v[key]))return fail();
  const name=(v.name as string).trim().normalize('NFC'),email=(v.email as string).trim(),role=(v.role as string).trim().normalize('NFC');
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[<>(),;:"\\]/.test(email))return fail();
  return {id:v.id,name,email,role};
 });
}
