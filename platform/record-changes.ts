/** Shared, lossless change protocol. Paths address records by identity, never by an
 * array index supplied by a browser. Unknown fields and non-keyed arrays round trip. */
export type RecordKey = {key:string;id:string|number};
export type RecordPath = (string|RecordKey)[];
export type RecordChange = {path:RecordPath;before?:unknown;value?:unknown;remove?:boolean;order?:boolean;anchor?:string|number|null};
type Doc = Record<string,any>;
const object = (v:unknown):v is Doc => !!v && typeof v==='object' && !Array.isArray(v);
const own = (v:object,k:string) => Object.hasOwn(v,k);
export function equalRecordValue(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equalRecordValue(v,b[i]));
  if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>own(b,k)&&equalRecordValue(a[k],b[k]));}
  return false;
}
const keyFor=(a:any[],b:any[])=>['id','matricule','code','columnId'].find(key=>[a,b].every(rows=>rows.every(r=>object(r)&&['string','number'].includes(typeof r[key]))&&new Set(rows.map(r=>r[key])).size===rows.length));
export function recordChanges(before:unknown,after:unknown):RecordChange[] {
  const changes:RecordChange[]=[];
  function visit(a:any,b:any,path:RecordPath){
    if(equalRecordValue(a,b))return;
    if(Array.isArray(a)&&Array.isArray(b)){
      const key=keyFor(a,b);
      if(key){
        const old=new Map(a.map(r=>[r[key],r])),next=new Map(b.map(r=>[r[key],r]));
        for(const r of a)if(!next.has(r[key]))changes.push({path:[...path,{key,id:r[key]}],before:r,remove:true});
        for(const r of b)if(old.has(r[key]))visit(old.get(r[key]),r,[...path,{key,id:r[key]}]);
        // Reverse insertion makes the next sibling available, including multiple new rows.
        for(let i=b.length-1;i>=0;i--)if(!old.has(b[i][key]))changes.push({path:[...path,{key,id:b[i][key]}],value:b[i],anchor:i+1<b.length?b[i+1][key]:null});
        const left=a.filter(r=>next.has(r[key])).map(r=>r[key]),right=b.filter(r=>old.has(r[key])).map(r=>r[key]);
        if(!equalRecordValue(left,right))changes.push({path,before:a.map(r=>r[key]),value:b.map(r=>r[key]),order:true});
        return;
      }
    }
    if(object(a)&&object(b)){
      for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
        if(!own(b,key))changes.push({path:[...path,key],before:a[key],remove:true});
        else if(!own(a,key))changes.push({path:[...path,key],value:b[key]});
        else visit(a[key],b[key],[...path,key]);
      }
      return;
    }
    changes.push({path,before:a,value:b});
  }
  // Match the historical JSON persistence contract (undefined object properties
  // are omitted, undefined array cells/non-finite numbers become null).
  const json=(value:unknown)=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  visit(json(before),json(after),[]);return changes;
}
export class RecordConflict extends Error {
  status=409;
  path:RecordPath;
  constructor(path:RecordPath){super('Cet enregistrement a été modifié dans une autre fenêtre. Votre copie est conservée. Rechargez les données avant de reporter cette modification.');this.path=path;}
}
const invalid=():never=>{throw Object.assign(new Error('Modifications par enregistrement invalides.'),{status:400});};
const safeKey=(k:unknown):k is string=>typeof k==='string'&&k.length>0&&k.length<=500&&!['__proto__','prototype','constructor'].includes(k);
export function validateChanges(value:unknown):asserts value is RecordChange[]{
  if(!Array.isArray(value)||value.length>15000)invalid();
  for(const c of value as Doc[]){
    if(!object(c)||!Array.isArray(c.path)||!c.path.length||c.path.length>40||c.path.some((p:unknown)=>typeof p==='string'?!safeKey(p):!object(p)||!safeKey(p.key)||!['string','number'].includes(typeof p.id)))invalid();
    if(c.remove!==undefined&&c.remove!==true||c.order!==undefined&&c.order!==true||c.remove&&c.order)invalid();
    if(c.remove?!own(c,'before')||own(c,'value'):!own(c,'value'))invalid();
    if(c.order&&(typeof c.path.at(-1)!=='string'||!Array.isArray(c.before)||!Array.isArray(c.value)||new Set(c.value).size!==c.value.length))invalid();
  }
}
/** Apply to a fresh server document; a failed precondition never changes the input. */
export function applyRecordChanges<T>(source:T,changes:RecordChange[],soft:(path:RecordPath)=>boolean=()=>false):T {
  validateChanges(changes);const result=structuredClone(source) as any;
  for(const change of changes){
    let parent=result;
    for(const part of change.path.slice(0,-1)){
      if(typeof part==='string'){if(!object(parent)||!own(parent,part))throw new RecordConflict(change.path);parent=parent[part];}
      else {if(!Array.isArray(parent))throw new RecordConflict(change.path);const matches=parent.filter(r=>object(r)&&r[part.key]===part.id);if(matches.length!==1)throw new RecordConflict(change.path);parent=matches[0];}
    }
    const last=change.path.at(-1)!;
    let index:number|undefined,present:boolean,current:any;
    if(typeof last==='string'){if(!object(parent))throw new RecordConflict(change.path);present=own(parent,last);current=parent[last];}
    else {if(!Array.isArray(parent))throw new RecordConflict(change.path);const matches=parent.map((r:any,i:number)=>object(r)&&r[last.key]===last.id?i:-1).filter((i:number)=>i>=0);if(matches.length>1)throw new RecordConflict(change.path);index=matches[0];present=index!==undefined;current=present?parent[index!]:undefined;}
    if(change.order){
      if(!Array.isArray(current))throw new RecordConflict(change.path);
      const key=keyFor(current,current),before=change.before as any[],after=change.value as any[];
      if(!key)throw new RecordConflict(change.path);
      const ids=current.map(r=>r[key]);if(equalRecordValue(ids,after))continue;
      // Reordering has an explicit collection-level precondition. Concurrent new
      // rows are retained by refusing an ambiguous reorder, never by dropping them.
      if(ids.some(id=>!after.includes(id))||after.some(id=>!ids.includes(id))||!equalRecordValue(ids.filter(id=>before.includes(id)),before.filter(id=>ids.includes(id))))throw new RecordConflict(change.path);
      (parent as Doc)[last as string]=after.map(id=>current.find(r=>r[key]===id));continue;
    }
    // Retrying an acknowledged-or-lost response is safe: assigning the same value
    // or deleting an already absent record is a no-op, never a second increment.
    if(change.remove&&!present||!change.remove&&present&&equalRecordValue(current,change.value))continue;
    if(!soft(change.path)&&(present!==own(change,'before')||present&&!equalRecordValue(current,change.before)))throw new RecordConflict(change.path);
    if(typeof last==='string'){
      if(change.remove)delete (parent as Doc)[last];else Object.defineProperty(parent,last,{value:structuredClone(change.value),writable:true,enumerable:true,configurable:true});
    }else if(change.remove)parent.splice(index!,1);
    else {
      if(!object(change.value)||change.value[last.key]!==last.id)invalid();
      if(present)(parent as any[])[index!]=structuredClone(change.value);
      else {
        const position=change.anchor==null?parent.length:parent.findIndex((r:any)=>r[last.key]===change.anchor);
        if(position<0)throw new RecordConflict(change.path);
        parent.splice(position,0,structuredClone(change.value));
      }
    }
  }
  return result;
}
