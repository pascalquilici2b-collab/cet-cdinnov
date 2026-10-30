import {useContext,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {BookUser,Check,ChevronRight,Plus,RotateCw} from 'lucide-react';
import type {BillingClientData,BillingClientDetails,BillingDirectoryRecord,BillingParty,BillingTransport} from '../billing-contracts';
import {blankClient} from '../billing-directory-domain';
import {enrichClient,sameClient} from '../billing-client-match';
import {sameClientForCreation} from '../billing-client-creation-match';
import {CompanyLookup} from './billing-company-lookup';
import {ClientAvatar,ClientLogosContext} from './billing-client-avatar';
import './billing-client-selection.css';

type ClientRecord=Extract<BillingDirectoryRecord,{kind:'clients'}>;
interface Props {
 party:BillingParty;clientId:string;transport:BillingTransport;disabled:boolean;
 onOpenDirectory:()=>void;onSelect:(party:BillingParty,clientId:string)=>void;
 onLink:(id:string)=>void;onBusy:(value:string)=>void;onChanged:()=>void;
 children:ReactNode;selectionRevision?:number;
}
const copy=<T,>(value:T):T=>structuredClone(value);
const message=(error:unknown)=>error instanceof Error?error.message:'Le carnet clients est indisponible. Vos coordonnées sont conservées.';
const identity=(party:BillingParty)=>[party.siret.replace(/\s/g,''),party.siren.replace(/\s/g,''),party.name.trim().toLocaleLowerCase('fr')].join('|');

/** Read-only matching, including shared name-only clients. Establishments with different SIRET stay distinct. */
async function matches(transport:BillingTransport,party:BillingParty,active:()=>boolean):Promise<{certain:ClientRecord[];possible:ClientRecord[]}> {
 const certain:ClientRecord[]=[],possible:ClientRecord[]=[];let offset=0;
 for(;;){
  const page=await transport.directoryList('clients',{q:'',offset,limit:100,archived:false});
  if(!active())return {certain:[],possible:[]};
  for(const row of page.records){if(row.kind!=='clients')continue;if(sameClientForCreation(row.data,party))certain.push(row);else if(sameClient(row.data,party))possible.push(row);}
  offset+=page.records.length;if(offset>=page.total)break;
  if(!page.records.length)throw Error('Le carnet clients a changé. Réessayez la vérification.');
 }
 return {certain,possible};
}

export function BillingClientSelection(props:Props){
 const [seed,setSeed]=useState<BillingClientData|null>(null),[state,setState]=useState<'idle'|'checking'|'available'|'existing'|'adding'|'added'|'error'>('idle');
 const [matchedClient,setMatchedClient]=useState<ClientRecord|null>(null),logos=useContext(ClientLogosContext);
 const [suggestions,setSuggestions]=useState<ClientRecord[]>([]);
 const [error,setError]=useState(''),[retry,setRetry]=useState(0),[failedAction,setFailedAction]=useState<'check'|'add'>('check');
 const current=useRef(props),live=useRef(true),generation=useRef(0),running=useRef(false),linked=useRef(''),attempt=useRef<{key:string;id:string;data:BillingClientData}|null>(null);current.current=props;
 const selectedRevision=useRef(props.selectionRevision);
 const partyIdentity=identity(props.party);
 useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;};},[]);
 // Choosing a different directory record discards only the temporary lookup metadata.
 useEffect(()=>{if(props.clientId&&props.clientId!==linked.current||props.selectionRevision!==selectedRevision.current){generation.current++;setSeed(null);setState('idle');setError('');setMatchedClient(null);setSuggestions([]);attempt.current=null;}selectedRevision.current=props.selectionRevision;},[props.clientId,props.selectionRevision]);
 useEffect(()=>{
  if(!seed||running.current)return;
  const ticket=++generation.current,party=copy(props.party);setState('checking');setError('');
  const active=()=>live.current&&ticket===generation.current;
  const timer=setTimeout(()=>{
   void matches(current.current.transport,party,active).then(({certain:rows,possible})=>{
    if(!active())return;
    if(rows.length>1)throw Error('Plusieurs fiches correspondent. Choisissez la bonne dans le carnet clients.');
    if(rows.length===1){linked.current=rows[0].id;setMatchedClient(rows[0]);setSuggestions([]);current.current.onLink(rows[0].id);setState(attempt.current?.id===rows[0].id?'added':'existing');}
    else{linked.current='';setMatchedClient(null);setSuggestions(possible);if(current.current.clientId)current.current.onLink('');setState('available');}
   }).catch(e=>{if(active()){setError(message(e));setFailedAction('check');setState('error');}});
  },180);
  return()=>{clearTimeout(timer);if(generation.current===ticket)generation.current++;};
 },[seed,partyIdentity,retry]);

 function select(party:BillingParty,details:BillingClientDetails){
  if(current.current.disabled||running.current)return;
  generation.current++;linked.current='';attempt.current=null;setMatchedClient(null);setSuggestions([]);setError('');setState('checking');
  setSeed(enrichClient(blankClient(),copy(party),copy(details)));
  current.current.onSelect(party,'');
 }
 function useRecord(row:ClientRecord,created:boolean){
  linked.current=row.id;setMatchedClient(row);setSuggestions([]);current.current.onLink(row.id);setError('');setState(created?'added':'existing');
  if(created)current.current.onChanged();
 }
 async function add(){
  if(current.current.disabled||running.current||!seed)return;
  // Snapshot the edited form at the click, rather than the original lookup result.
  const party=copy(current.current.party),sameEstablishment=seed.party.siret.replace(/\s/g,'')===party.siret.replace(/\s/g,'')&&seed.party.siren.replace(/\s/g,'')===party.siren.replace(/\s/g,'');
  // Legal lookup metadata belongs to the selected establishment, not a manually substituted SIRET.
  const data:BillingClientData={...(sameEstablishment?copy(seed):blankClient()),party},key=JSON.stringify(data);
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID(),data};
  const request=attempt.current,ticket=++generation.current,active=()=>live.current&&ticket===generation.current;
  running.current=true;setState('adding');setError('');current.current.onBusy('client-add');
  try{
   const {certain:existing}=await matches(current.current.transport,data.party,active);if(!active())return;
   if(existing.length>1)throw Error('Plusieurs fiches correspondent. Choisissez la bonne dans le carnet clients.');
   if(existing.length===1){useRecord(existing[0],existing[0].id===request.id);return;}
   const result=await current.current.transport.directoryCreate('clients',request.id,request.data);
   if(active()){if(result.kind!=='clients')throw Error('La fiche enregistrée n’est pas une fiche client.');useRecord(result,true);}
  }catch(e){
   if(!active())return;
   // Another session may have created the same client between the read and POST.
   if(e&&typeof e==='object'&&'status' in e&&e.status===409){
    try{const {certain:existing}=await matches(current.current.transport,data.party,active);if(active()&&existing.length===1){useRecord(existing[0],existing[0].id===request.id);return;}}catch{}
   }
   if(active()){setError(message(e));setFailedAction('add');setState('error');}
  }finally{running.current=false;if(live.current)current.current.onBusy('');}
 }
 const changedAfterAdd=!!attempt.current&&props.clientId===attempt.current.id&&JSON.stringify(props.party)!==JSON.stringify(attempt.current.data.party);
 const displayState=state==='added'&&changedAfterAdd?'existing':state;
 const showAdd=!!seed&&(displayState==='available'||displayState==='adding'||displayState==='added'||displayState==='error'&&failedAction==='add');
 const logo=matchedClient?.id===props.clientId?matchedClient.data:logos.find(row=>row.id===props.clientId);
 return <div className="bill-client-selection">
  <button type="button" className="bill-client-book" aria-label="Choisir dans le carnet clients" disabled={props.disabled||running.current} onClick={props.onOpenDirectory}>
   {props.clientId?<ClientAvatar name={props.party.name} identifier={props.party.siret||props.party.siren} logoKey={logo?.logoKey} logoData={logo?.logoData}/>:<span className="bill-client-book-icon"><BookUser size={19} aria-hidden="true"/></span>}
   <span className="bill-client-book-copy"><strong title={props.party.name||undefined}>{props.clientId&&props.party.name?props.party.name:'Carnet clients'}</strong><span>{props.clientId?(props.party.siret?'SIRET '+props.party.siret:'Choisir un autre client'):'Choisir un client'}</span></span>
   <ChevronRight size={17} className="bill-client-book-chevron" aria-hidden="true"/>
  </button>
  <CompanyLookup key={props.selectionRevision} party={props.party} disabled={props.disabled||running.current} onSelect={select}/>
  {props.children}
  {!!seed&&<div className="bill-client-enrollment">
   {showAdd&&<button type="button" className={'bill-client-add'+(displayState==='added'?' is-added':'')} disabled={props.disabled||displayState==='adding'||displayState==='added'} onClick={()=>void add()}>
    {displayState==='added'?<Check size={14} aria-hidden="true"/>:displayState==='adding'?<RotateCw size={14} className="bill-client-saving" aria-hidden="true"/>:<Plus size={14} aria-hidden="true"/>}
    {displayState==='added'?'Ajouté aux clients':displayState==='adding'?'Ajout…':displayState==='error'?'Réessayer l’ajout':suggestions.length?'Ajouter cet établissement':'Ajouter aux clients'}
   </button>}
   {!!suggestions.length&&displayState==='available'&&<button type="button" className="bill-client-review" disabled={props.disabled} title="Une fiche ressemble à cet établissement, mais son SIRET n’est pas renseigné. Vérifiez-la dans le carnet ou ajoutez cet établissement séparément." onClick={props.onOpenDirectory}><BookUser size={13} aria-hidden="true"/>Fiche à vérifier</button>}
   <span role="status" aria-live="polite" title={changedAfterAdd?'La fiche du carnet reste inchangée.':undefined} className={'bill-client-enrollment-status'+(displayState==='added'?' is-success':'')}>
    {displayState==='checking'?'Vérification du carnet…':displayState==='existing'?(changedAfterAdd?'Modifications réservées au document':'Déjà dans le carnet clients'):displayState==='added'?<><span className="bill-client-success-check"><Check size={12} aria-hidden="true"/></span>Client ajouté</>:''}
   </span>
   {error&&<div className="bill-client-enrollment-error" role="alert"><span>{error}</span>{failedAction==='check'&&<button type="button" disabled={props.disabled} onClick={()=>setRetry(n=>n+1)}>Vérifier le carnet clients</button>}</div>}
  </div>}
 </div>;
}
