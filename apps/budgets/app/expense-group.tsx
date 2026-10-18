"use client";
import {useState,type ReactNode} from "react";
import {CheckCircle2,ChevronDown} from "lucide-react";
import {currency} from "@/lib/budget-model";

export default function ExpenseGroup({kind,count,total,children}:{kind:"assigned"|"pending";count:number;total:number;children:ReactNode}){
  const [expanded,setExpanded]=useState(kind==="pending");
  return <details className={`expense-group expense-group-${kind}`} open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
    <summary><ChevronDown className="expense-group-chevron" aria-hidden="true"/>{kind==="assigned"&&<CheckCircle2 aria-hidden="true"/>}<strong>{kind==="assigned"?"Dépenses associées":"Dépenses à affecter"}</strong>
      {kind==="assigned"?<span className="expense-assigned-count" aria-label={`${count} dépenses associées`}>{count}</span>:<span className="expense-pending-pill">À associer <b>{count}</b></span>}
      <span className="expense-group-total">{currency(total)}</span>
    </summary>
    {children}
  </details>;
}
