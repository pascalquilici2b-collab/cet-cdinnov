import type {Database} from './contracts';
import {equalRecordValue} from './record-changes.ts';
import {saveBusinessDocument} from './business-schema.mjs';
type Doc=Record<string,any>;
export type RecordDomain='portal'|'budgets'|'sheets';
export const recordSources={portal:{table:'app_portal_workspace',revision:'version'},budgets:{table:'budgets_workspace',revision:'version'},sheets:{table:'cdinnov_sheets_workspace',revision:'revision'}} as const;
type Edit={path:string;value?:unknown;remove?:boolean};
/** SQLite JSON paths are generated only on the server. Replace changed records,
 * preserve untouched records; structural array edits replace that collection.
 * This transitional read model keeps old clients, exports and SQL projections intact. */
export function storageEdits(before:unknown,after:unknown):Edit[]{
  const edits:Edit[]=[];
  function visit(a:any,b:any,path:string){
    if(equalRecordValue(a,b))return;
    if(Array.isArray(a)&&Array.isArray(b)){
      const key=['id','matricule','code','columnId'].find(k=>[a,b].every(rows=>rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&['string','number'].includes(typeof r[k]))&&new Set(rows.map(r=>r[k])).size===rows.length));
      if(key){
        const ids=new Set(b.map(r=>r[key])),remaining=a.filter(r=>ids.has(r[key]));
        // Deletions and tail insertions address just the affected records. A real
        // reorder or insertion in the middle retains a collection-level edit.
        if(remaining.every((r,i)=>r[key]===b[i]?.[key])){
          for(let i=a.length-1;i>=0;i--)if(!ids.has(a[i][key]))edits.push({path:path+'['+i+']',remove:true});
          remaining.forEach((r,i)=>visit(r,b[i],path+'['+i+']'));
          for(let i=remaining.length;i<b.length;i++)edits.push({path:path+'[#]',value:b[i]});
          return;
        }
      }
    }else if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
      // Nested sheet rows/columns are separate records. Other objects are walked
      // too, so editing a client name does not bind its unchanged inline logo.
      for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
        // SQLite cannot reliably address a property containing a quote. Preserve
        // arbitrary imported extensions by replacing the nearest safe ancestor.
        if(/["\\\x00-\x1f]/.test(k)){edits.push({path,value:b});return;}
      }
      for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
        const p=path+'.'+JSON.stringify(k);
        if(!Object.hasOwn(b,k))edits.push({path:p,remove:true});
        else if(!Object.hasOwn(a,k))edits.push({path:p,value:b[k]});
        else visit(a[k],b[k],p);
      }
      return;
    }
    edits.push({path,value:b});
  }
  visit(before,after,'$');return edits;
}
export async function readRecordSource(db:Database,domain:RecordDomain,empty:Doc,initial:number){
  const {table,revision}=recordSources[domain];
  const row=await db.prepare(`SELECT payload,${revision} AS version FROM ${table} WHERE id='shared'`).first<{payload:string;version:number}>();
  return {document:row?JSON.parse(row.payload):structuredClone(empty),version:row?.version??initial,exists:!!row};
}
export async function saveRecordSource(db:Database,domain:RecordDomain,before:Doc,after:Doc,version:number,email:string,exists=true):Promise<number|null>{
  if(new TextEncoder().encode(JSON.stringify(after)).length>1500000)throw Object.assign(new Error('Cet espace dépasse 1,5 Mo. Réduisez la taille des fichiers intégrés avant de réessayer.'),{status:413});
  return saveBusinessDocument(db,domain,before,after,version,email,exists);
}
