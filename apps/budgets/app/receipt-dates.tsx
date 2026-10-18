"use client";
import type {DR} from "@/lib/budget-model";
import {receiptDate} from "@/lib/receipt-date";
import {fullDate} from "@/lib/project-dates";

export default function ReceiptDates({period,dr,disabled,onUpdate}:{period:string;dr?:DR;disabled:boolean;onUpdate:(period:string,patch:Partial<DR>)=>void}){
  const date=receiptDate(dr);
  return <div className="dr-dates">
    <label><span>Certificat</span><input type="date" aria-label={`Date du certificat ${period}`} value={dr?.certificateDate||""} disabled={disabled} onChange={e=>onUpdate(period,{certificateDate:e.target.value||undefined})}/></label>
    <div className="receipt-expected"><span>Encaissement</span><strong>Prévu le {fullDate(date)}</strong>{date&&<small>{dr?.receiptDate?"Date personnalisée":"Certificat + 6 mois"}</small>}</div>
    <details className="receipt-date-edit"><summary>Modifier la date</summary><label><span>Date prévue</span><input type="date" aria-label={`Encaissement ${period}`} value={date} disabled={disabled} onChange={e=>onUpdate(period,{receiptDate:e.target.value||undefined})}/></label>{dr?.receiptDate&&<button disabled={disabled} onClick={()=>onUpdate(period,{receiptDate:undefined})}>Revenir à certificat + 6 mois</button>}</details>
  </div>;
}
