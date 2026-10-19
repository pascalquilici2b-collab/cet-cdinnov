import type {ReactNode} from 'react';
import {useEffect,useState} from 'react';
import type {BillingDocument,BillingTransport} from '../billing-contracts';
import {formatMinor} from '../billing-domain';
import {PDFPreview} from './billing-pdf-preview';
import {billingStateLabel} from './billing-issuance-ui';

const date=(value:string)=>value?value.split('-').reverse().join('/'):'À préciser';
export function IssuedDocument({record,transport,children,fallback}:{record:BillingDocument;transport:BillingTransport;children:ReactNode;fallback:ReactNode}){
 const d=record.data,ready=record.status==='issued';
 const [view,setView]=useState<'summary'|'document'>(ready?'document':'summary');
 useEffect(()=>{if(ready)setView('document');},[ready]);
 return <section className={'bill-issued-layout bill-issued-show-'+view} aria-label="Consultation du document">
  <div className="bill-issued-mobile-heading"><strong>{record.issuance?.number}</strong><span>{record.totals?formatMinor(record.totals.grossMinor):'—'}</span></div>
  <div className="bill-issued-mobile-tabs" role="group" aria-label="Affichage du document"><button type="button" aria-pressed={view==='summary'} onClick={()=>setView('summary')}>Résumé</button><button type="button" aria-pressed={view==='document'} onClick={()=>setView('document')}>{ready?'Document PDF':'Aperçu'}</button></div>
  <aside className="bill-document-summary">
   <div className="bill-document-identity"><span className={'bill-document-state '+(ready?'is-ready':'')}>{billingStateLabel(record)}</span><p>{d.kind==='invoice'?'Facture':'Devis'}</p><h2>{record.issuance?.number}</h2><h3>{d.title||'Sans objet'}</h3></div>
   <div className="bill-document-amount"><span>Total TTC</span><strong>{record.totals?formatMinor(record.totals.grossMinor):'—'}</strong><small>{record.totals?formatMinor(record.totals.netMinor)+' HT · '+formatMinor(record.totals.taxMinor)+' de TVA':''}</small></div>
   <div className="bill-document-customer"><span>CLIENT</span><h3>{d.buyer.name}</h3><p>{d.buyer.addressLine1}<br/>{d.buyer.postalCode} {d.buyer.city}</p>{d.buyer.email&&<p>{d.buyer.email}</p>}</div>
   <dl className="bill-document-dates"><div><dt>Date du document</dt><dd>{date(d.issueDate)}</dd></div><div><dt>{d.kind==='quote'?'Valable jusqu’au':'Échéance'}</dt><dd>{date(d.kind==='quote'?d.validUntil:d.dueDate)}</dd></div></dl>
   {(d.references.businessCode||d.references.marketReference)&&<details className="bill-document-details"><summary>Dossier associé</summary><p>{d.references.businessCode}</p><p>{d.references.marketReference}</p></details>}
   {ready&&d.kind==='invoice'&&<div className="bill-document-delivery"><b>Transmission à AGIRIS</b><p>À effectuer depuis votre plateforme avec le fichier Factur-X téléchargé.</p></div>}
   {children}
  </aside>
  {ready?<PDFPreview record={record} transport={transport}/>:fallback}
 </section>;
}
