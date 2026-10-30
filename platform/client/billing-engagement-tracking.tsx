import {useEffect,useId,useRef,useState} from 'react';
import {Gauge,FileCheck2,Download,RefreshCw,Search,ChevronDown,FolderKanban,ReceiptText,Eye,Paperclip,X,AlertCircle} from 'lucide-react';
import type {BillingEngagementTracking,BillingTransport} from '../billing-contracts';
import {engagementClientOptions,engagementOrderKey,filterEngagementMarkets,groupEngagementOrders} from '../billing-engagement-groups';
import type {BillingEngagementOrderGroup,EngagementOrder} from '../billing-engagement-groups';
import {Help} from './billing-help';
import {BrandMark} from './loading';
import {ClientAvatar} from './billing-client-avatar';
import {engagementMoney as money} from './engagement-meter';
import {MarketMeter} from './billing-market-meter';
import {invoiceDisplayNumber} from './billing-invoice-label';
import {PDFPreview} from './billing-pdf-preview';
import './billing-engagement-tracking.css';

type EngagementFile=EngagementOrder['files'][number];
type PreviewState={file:EngagementFile;blob:Blob|null;error:string};
const dateLabel=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):(value||'Date à renseigner');
const fileKey=(file:EngagementFile)=>JSON.stringify([file.marketId||'',file.documentId]);
const errorText=(error:unknown)=>error instanceof Error?error.message:'Le document est indisponible. Réessayez.';

export function EngagementTracking({transport,onOpen}:{transport:BillingTransport;onOpen:(id:string)=>void}){
 const [data,setData]=useState<BillingEngagementTracking|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,refresh]=useState(0);
 const [tab,setTab]=useState<'orders'|'markets'>('orders'),[search,setSearch]=useState(''),[client,setClient]=useState(''),[preview,setPreview]=useState<PreviewState|null>(null),[downloading,setDownloading]=useState<string[]>([]);
 const panelId=useId(),dialog=useRef<HTMLDialogElement>(null),previewEpoch=useRef(0),alive=useRef(true),downloadLocks=useRef(new Set<string>()),objectURLs=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;previewEpoch.current++;for(const [url,timer] of objectURLs.current){clearTimeout(timer);URL.revokeObjectURL(url);}objectURLs.current.clear();};},[]);
 useEffect(()=>{let active=true;setError('');setLoading(true);transport.engagements().then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(errorText(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[transport,revision]);
 useEffect(()=>{if(preview&&!dialog.current?.open)dialog.current?.showModal();else if(!preview)dialog.current?.close();},[!!preview]);
 const filters={search,client},groups=data?groupEngagementOrders(data,filters):[],markets=data?filterEngagementMarkets(data,filters):[],clients=data?engagementClientOptions(data):[];
 const totals=groups.reduce((sum,g)=>({orders:sum.orders+g.orders.length,amount:sum.amount+g.totals.amountMinor,invoiced:sum.invoiced+g.totals.invoicedMinor,reserved:sum.reserved+g.totals.reservedMinor,unknown:sum.unknown+g.totals.unknownAmountCount,pending:sum.pending||g.totals.historyPending}),{orders:0,amount:0,invoiced:0,reserved:0,unknown:0,pending:false});
 const available=totals.unknown?null:totals.amount-totals.invoiced-totals.reserved;
 const fetchFile=(file:EngagementFile)=>file.marketId?transport.marketDocument(file.marketId,file.documentId):transport.engagementFile(file.documentId);
 function closePreview(){previewEpoch.current++;setPreview(null);}
 async function openPreview(file:EngagementFile){const epoch=++previewEpoch.current;setPreview({file,blob:null,error:''});try{const blob=await fetchFile(file);if(!alive.current||epoch!==previewEpoch.current)return;if(await blob.slice(0,5).text()!=='%PDF-')throw new Error('Cette pièce ne peut pas être affichée en aperçu. Vous pouvez la télécharger.');if(alive.current&&epoch===previewEpoch.current)setPreview({file,blob,error:''});}catch(e){if(alive.current&&epoch===previewEpoch.current)setPreview({file,blob:null,error:errorText(e)});}}
 async function download(file:EngagementFile){const key=fileKey(file);if(downloadLocks.current.has(key))return;downloadLocks.current.add(key);setDownloading(keys=>[...keys,key]);try{const blob=await fetchFile(file);if(!alive.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.filename||'piece';a.click();const timer=setTimeout(()=>{URL.revokeObjectURL(url);objectURLs.current.delete(url);},60000);objectURLs.current.set(url,timer);}catch(e){if(alive.current)setError(errorText(e));}finally{downloadLocks.current.delete(key);if(alive.current)setDownloading(keys=>keys.filter(k=>k!==key));}}
 const fileActions={onPreview:openPreview,onDownload:download,downloading};
 return <section className="bill-engagement-tracking" aria-label="Suivi des engagements">
  <header className="bill-engagement-heading"><h2>Suivi engagements</h2><button type="button" className="bill-icon-button" title="Actualiser" aria-label="Actualiser le suivi" disabled={loading} onClick={()=>refresh(n=>n+1)}><RefreshCw size={17}/></button></header>
  <div className="bill-engagement-tabs" role="tablist" aria-label="Type d’engagement" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'orders':event.key==='End'?'markets':tab==='orders'?'markets':'orders';setTab(next);event.currentTarget.querySelector<HTMLButtonElement>('[data-tab="'+next+'"]')?.focus();}}>
   <button type="button" id={panelId+'-orders'} data-tab="orders" role="tab" tabIndex={tab==='orders'?0:-1} aria-selected={tab==='orders'} aria-controls={panelId} onClick={()=>setTab('orders')}><FileCheck2 size={16}/>Bons de commande</button>
   <button type="button" id={panelId+'-markets'} data-tab="markets" role="tab" tabIndex={tab==='markets'?0:-1} aria-selected={tab==='markets'} aria-controls={panelId} onClick={()=>setTab('markets')}><Gauge size={16}/>Marchés globaux</button>
  </div>
  <div className="bill-engagement-summary" aria-live="polite"><div><span>{tab==='orders'?'Bons reçus':'Marchés suivis'}</span><strong>{data?(tab==='orders'?totals.orders:markets.length):'—'}</strong></div>{tab==='orders'&&<>
   <div><span>Engagé HT</span><strong>{!data?'—':totals.unknown?'À compléter':money(totals.amount)}</strong>{!!totals.unknown&&<small>{totals.unknown} montant{totals.unknown>1?'s':''} à renseigner</small>}</div>
   <div><span>Facturé HT</span><strong>{data?money(totals.invoiced):'—'}</strong></div>
   <div><span>Disponible HT</span><strong data-over={available!==null&&available<0}>{!data||available===null?'—':money(available)}</strong>{totals.pending&&<small>Provisoire</small>}</div>
  </>}</div>
  <div className="bill-engagement-tools"><label className="bill-search"><Search size={16}/><input placeholder="Client, projet ou référence…" aria-label="Rechercher un engagement" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Effacer la recherche" onClick={()=>setSearch('')}><X size={15}/></button>}</label><select aria-label="Client des engagements" value={client} onChange={e=>setClient(e.target.value)}><option value="">Tous les clients</option>{clients.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
  {error&&<div role="alert" className="bill-engagement-error"><AlertCircle size={17}/><span>{error}</span><button type="button" disabled={loading} onClick={()=>refresh(n=>n+1)}>Réessayer</button></div>}
  <div id={panelId} role="tabpanel" aria-labelledby={panelId+'-'+tab} aria-busy={loading}>
   {!data&&loading?<div className="bill-engagement-loading" role="status"><BrandMark/>Chargement des engagements…</div>:data&&<>
    {loading&&<p className="bill-engagement-refreshing" role="status">Actualisation du suivi…</p>}
    {tab==='orders'?<div className="bill-engagement-folders">{groups.map(group=><OrderFolder key={group.key} group={group} onOpen={onOpen} {...fileActions}/>)}</div>:<div className="bill-engagement-market-grid">{markets.map(m=><MarketCard key={m.id} market={m}/>)}</div>}
    {!(tab==='orders'?groups:markets).length&&<p className="bill-engagement-empty">{search||client?'Aucun résultat pour ces filtres.':'Aucun engagement renseigné.'}</p>}
    {tab==='orders'&&!!totals.reserved&&<p className="bill-engagement-footnote">Le disponible tient compte de {money(totals.reserved)} HT réservés par des factures en brouillon.</p>}
   </>}
  </div>
  <dialog ref={dialog} className="bill-engagement-preview" aria-label={preview?'Pièce jointe · '+preview.file.filename:'Pièce jointe'} onCancel={closePreview} onClose={()=>{if(preview)closePreview();}}>
   {preview&&<><header><div><Paperclip size={17}/><strong>{preview.file.filename}</strong></div><div><button type="button" className="bill-icon-button" aria-label={'Télécharger '+preview.file.filename} title="Télécharger" disabled={downloading.includes(fileKey(preview.file))} onClick={()=>void download(preview.file)}><Download size={18}/></button><button type="button" className="bill-icon-button" aria-label="Fermer l’aperçu" onClick={closePreview}><X size={19}/></button></div></header>{preview.error?<p className="bill-engagement-preview-error" role="alert">{preview.error}</p>:preview.blob?<PDFPreview record={null} file={preview.blob}/>:<div className="bill-engagement-loading" role="status"><BrandMark/>Chargement de la pièce…</div>}</>}
  </dialog>
 </section>;
}

type FileActions={onPreview:(file:EngagementFile)=>Promise<void>;onDownload:(file:EngagementFile)=>Promise<void>;downloading:string[]};
function OrderFolder({group:g,onOpen,...files}:{group:BillingEngagementOrderGroup;onOpen:(id:string)=>void}&FileActions){
 const m=g.market,title=m?.reference||m?.title||(g.marketId?'Marché indisponible':'Bons sans marché rattaché');
 return <article className={'bill-engagement-folder'+(!m?' is-unassigned':'')} data-market-id={g.marketId} aria-label={'Dossier '+title}>
  <header className="bill-engagement-folder-head"><div className="bill-engagement-folder-identity"><FolderKanban size={22}/><div><h3>{title}</h3><p>{m?[m.client,m.reference?m.title:''].filter(Boolean).join(' · '):g.marketId?'Le marché de ces bons n’est plus disponible.':'Ces bons restent visibles en attendant leur rattachement à un marché.'}</p></div></div>{m?.consumption&&<div className="bill-engagement-folder-meter"><span>Devis envoyés / plafond du marché</span><MarketMeter market={{...m,clientName:m.client}}/></div>}</header>
  <div className="bill-engagement-table-wrap"><table className="bill-engagement-order-table"><caption className="bill-sr-only">Bons de commande du dossier {title}</caption><thead><tr><th scope="col">Bon de commande</th><th scope="col">Projet</th><th scope="col">Facturé / engagé HT</th><th scope="col">Disponible HT</th><th scope="col">Factures et pièces</th></tr></thead>{g.orders.map(order=><OrderRows key={engagementOrderKey(order)} order={order} onOpen={onOpen} {...files}/>)}</table></div>
  <footer className="bill-engagement-folder-footer"><span>{g.orders.length===g.allOrderCount?g.orders.length+' bon'+(g.orders.length>1?'s':''):g.orders.length+' sur '+g.allOrderCount+' bons affichés'}{g.totals.historyPending&&' · Historique à vérifier'}</span>{m?.consumption?.annual&&<span>{m.consumption.resetDate?'Réinitialisation annuelle : '+dateLabel(m.consumption.resetDate):'Réinitialisation annuelle à renseigner'}</span>}</footer>
 </article>;
}

function OrderRows({order:o,onOpen,onPreview,onDownload,downloading}:{order:EngagementOrder;onOpen:(id:string)=>void}&FileActions){
 const [open,setOpen]=useState(false),detailId=useId(),reserved=o.reservedMinor||0,available=o.amountMinor===null?null:o.amountMinor-o.invoicedMinor-reserved;
 const primary=o.files.find(f=>/\.pdf$/i.test(f.filename))||o.files[0];
 return <tbody className="bill-engagement-order" data-order-id={o.id}>
  <tr className="bill-engagement-order-row"><td data-label="Bon de commande"><div className="bill-engagement-order-identity"><span className="bill-engagement-docmark"><FileCheck2 size={19}/></span><div><strong>{o.reference||'Référence à renseigner'}{o.notes&&<Help label={'Informations sur '+o.reference} text={o.notes}/>}</strong><small>{o.client||'Client à renseigner'} · {dateLabel(o.date)}</small>{o.kind==='signed_quote'&&<small>Devis signé</small>}</div></div></td>
   <td data-label="Projet"><span className="bill-engagement-order-project">{o.project||'Engagement global'}</span>{o.market&&<small className="bill-engagement-order-market">{o.market}</small>}</td>
   <td data-label="Facturé / engagé HT"><OrderConsumption order={o}/></td>
   <td data-label="Disponible HT"><span className="bill-engagement-available" data-over={available!==null&&available<0}>{available===null?'À préciser':money(available)}</span>{available!==null&&available<0&&<small className="bill-engagement-overrun">Dépassement</small>}{o.historyPending&&<span className="bill-engagement-provisional">Provisoire <Help label="Historique à vérifier" text="Le disponible est provisoire jusqu’au rapprochement complet des anciennes factures. Les factures rattachées et les réservations en brouillon sont prises en compte."/></span>}</td>
   <td data-label="Factures et pièces"><div className="bill-engagement-row-actions"><button type="button" className="bill-engagement-expand" aria-expanded={open} aria-controls={detailId} aria-label={(open?'Masquer':'Voir')+' les factures et pièces du bon '+o.reference} onClick={()=>setOpen(value=>!value)}><ReceiptText size={15}/><span>{o.invoices.length}</span>{o.files.length>1&&<><Paperclip size={14}/><span>{o.files.length}</span></>}<ChevronDown size={14}/></button>{primary&&<><button type="button" className="bill-icon-button" title={'Aperçu · '+primary.filename} aria-label={'Aperçu du bon '+o.reference} onClick={()=>void onPreview(primary)}><Eye size={17}/></button><button type="button" className="bill-icon-button" title={'Télécharger '+primary.filename} aria-label={'Télécharger '+primary.filename} disabled={downloading.includes(fileKey(primary))} onClick={()=>void onDownload(primary)}><Download size={16}/></button></>}</div></td>
  </tr>
  {open&&<tr className="bill-engagement-detail-row"><td colSpan={5}><div id={detailId} className="bill-engagement-order-details"><div className="bill-engagement-detail-invoices"><h4>Factures rattachées</h4>{o.invoices.length?<ul>{o.invoices.map(invoice=><li key={invoice.id}><button type="button" onClick={()=>onOpen(invoice.id)}><ReceiptText size={14}/>{invoiceDisplayNumber(invoice.number.replace(/^Facture\s*/i,''))}{invoice.trashed&&<span className="bill-engagement-trash">Corbeille</span>}</button><strong>{money(invoice.amountMinor)} HT</strong></li>)}</ul>:<p>Aucune facture rattachée.</p>}</div>{!!o.files.length&&<div className="bill-engagement-detail-files"><h4>Pièces jointes</h4><ul>{o.files.map(file=><li key={fileKey(file)}><button type="button" className="bill-engagement-file-link" onClick={()=>void onPreview(file)} title={file.filename}><Paperclip size={14}/><span>{file.filename}</span></button><button type="button" className="bill-icon-button" aria-label={'Télécharger '+file.filename} title="Télécharger" disabled={downloading.includes(fileKey(file))} onClick={()=>void onDownload(file)}><Download size={16}/></button></li>)}</ul></div>}</div></td></tr>}
 </tbody>;
}

function OrderConsumption({order:o}:{order:EngagementOrder}){
 const max=o.amountMinor,reserved=o.reservedMinor||0,percent=max!==null&&max>0?o.invoicedMinor/max*100:null,used=Math.max(0,Math.min(100,percent||0)),held=max!==null&&max>0?Math.max(0,Math.min(100-used,reserved/max*100)):0,total=o.invoicedMinor+reserved;
 const tone=max!==null&&total>max?'over':max!==null&&max>0&&o.invoicedMinor===max&&!reserved?'complete':percent!==null&&percent>=85?'near':'normal';
 return <div className="bill-engagement-consumption" data-tone={tone}><div className="bill-engagement-consumption-values"><strong>{money(o.invoicedMinor)}</strong><span>/ {max===null?'À renseigner':money(max)}</span></div><div className="bill-engagement-consumption-track" role="progressbar" aria-label={'Consommation du bon '+o.reference} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent===null?undefined:used} aria-valuetext={money(o.invoicedMinor)+' HT facturés'+(max===null?', montant engagé à renseigner':' sur '+money(max)+' HT engagés')+(reserved?', '+money(reserved)+' HT réservés en brouillons':'')}><span style={{width:used+'%'}}/>{held>0&&<i style={{left:used+'%',width:held+'%'}}/>}</div><div className="bill-engagement-consumption-caption"><span>{reserved>0?money(reserved)+' en brouillons':''}</span><span>{percent===null?'—':Math.round(percent)+' %'}</span></div></div>;
}

function MarketCard({market:m}:{market:BillingEngagementTracking['markets'][number]}){
 const [period,setPeriod]=useState(''),c=m.consumption,selected=c?.periods.find(p=>p.startDate===period),consumption=c&&selected?{...c,...selected}:c,orders=consumption?.orders||[],orderAmount=orders.some(o=>o.amountMinor===null)?null:orders.reduce((sum,o)=>sum+(o.amountMinor??0),0);
 return <article className="bill-engagement-market-card" aria-label={'Marché global '+(m.reference||m.title)} data-market-id={m.id}>
  <header><span className="bill-engagement-market-tag"><FolderKanban size={17}/>Marché global</span><div className="bill-engagement-market-client"><ClientAvatar name={m.client}/><span>{m.client||'Client à renseigner'}</span></div></header>
  <h3>{m.reference||m.title||'Marché sans titre'}</h3>{m.reference&&m.title&&<p className="bill-engagement-market-title">{m.title}</p>}
  {c?.annual&&!!c.periods.length&&<label className="bill-engagement-period"><span>Période</span><select aria-label={'Période du marché '+(m.reference||m.title)} value={selected?period:''} onChange={e=>setPeriod(e.target.value)}><option value="">Période actuelle</option>{c.periods.filter(p=>!p.current).map(p=><option key={p.startDate} value={p.startDate}>{dateLabel(p.startDate)} – {dateLabel(p.endDate)}</option>)}</select></label>}
  <div className="bill-engagement-market-consumption"><span>Devis envoyés / plafond HT</span>{consumption?<MarketMeter market={{...m,clientName:m.client,consumption}}/>:<div className="bill-engagement-market-fallback"><strong>{money(m.quotedMinor)}</strong><span>/ {money(m.maximumMinor)} HT</span></div>}</div>
  <footer><span>{consumption?.sentQuoteCount??m.sentQuoteCount} devis envoyé{(consumption?.sentQuoteCount??m.sentQuoteCount)>1?'s':''}</span>{selected&&<span>Historique · {dateLabel(selected.startDate)} – {dateLabel(selected.endDate)}</span>}</footer>
  {!!orders.length&&<details className="bill-engagement-market-orders"><summary><span>Bons reçus · période sélectionnée</span><strong>{orderAmount===null?'Montant à préciser':money(orderAmount)+' HT'}<ChevronDown size={14}/></strong></summary><ul>{orders.map((order,i)=><li key={order.reference+':'+i}><div><strong>{order.reference||'Référence à renseigner'}</strong><small>{dateLabel(order.date)}</small></div><span>{order.amountMinor===null?'Montant à préciser':money(order.amountMinor)+' HT'}</span></li>)}</ul></details>}
 </article>;
}
