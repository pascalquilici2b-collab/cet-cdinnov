"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { accountingPlan } from "@/lib/account-suggestions";
export default function AccountReference(){
 const [query,setQuery]=useState(""),all=accountingPlan();
 const shown=all.filter(a=>(a.code+" "+a.label).toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
 return <section className="project-date-settings"><div className="flex items-center justify-between gap-4"><h3>Plan comptable EPCIC</h3><span className="reference-label">{all.length} codes</span></div><label className="account-search mt-4"><Search size={17}/><input aria-label="Rechercher dans la nomenclature EPCIC" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Code ou libellé"/></label><div className="account-reference-list">{shown.map(a=><div key={a.code}><strong>{a.code}</strong><span>{a.label}</span></div>)}</div></section>;
}
