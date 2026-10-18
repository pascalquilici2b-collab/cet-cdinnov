"use client";

import { useState } from "react";
import { ArrowUpRight, CalendarDays, Plus, Search, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Workspace } from "@/lib/budget-model";
import { currency } from "@/lib/budget-model";
import { ProjectLogo } from "./project-branding";
import { ClientLogo } from "./client-directory";
import jemsLogo from "./assets/jems-logo.png?url";

export default function ProjectPicker({ workspace, onSelect, onNewProject, onNewClient, onImportJems, disabled }: {
  workspace: Workspace; onSelect: (id: string) => void; onNewProject: () => void; onNewClient: () => void; onImportJems:()=>void; disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("all");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
  const projects = workspace.projects.filter(project => (clientId === "all" || project.clientId === clientId) && normalize([project.acronym, project.name, project.jems?.projectId, workspace.clients.find(c => c.id === project.clientId)?.name].join(" ")).includes(normalize(query)));
  return <section className="project-picker">
    <div className="page-heading">
      <div><h1>Vos projets<span className="brand-dot">.</span></h1></div>
      <div className="project-picker-actions"><Button className="jems-import-button" onClick={onImportJems} disabled={disabled}><span className="jems-logo-box"><img src={jemsLogo} alt="JEMS"/></span>Importer un budget JEMS</Button><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onNewClient} disabled={disabled}>Clients · {workspace.clients.length}</Button><Button variant="outline" onClick={onNewProject} disabled={disabled || !workspace.clients.length}><Plus/>Créer manuellement</Button></div></div>
    </div>
    <div className="project-filters">
      <label className="search-field"><Search aria-hidden="true"/><input aria-label="Rechercher un projet ou un client" placeholder="Rechercher un projet ou un client" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <Select value={clientId} onValueChange={setClientId}><SelectTrigger aria-label="Filtrer par client" className="client-filter"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Tous les clients</SelectItem>{workspace.clients.map(client => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="project-grid">
      {projects.map(project => <button key={project.id} className="project-card" onClick={() => onSelect(project.id)} disabled={disabled} aria-label={"Ouvrir le projet " + project.acronym}>
        <div className="project-client client-identity"><ClientLogo client={workspace.clients.find(c=>c.id===project.clientId)}/>{workspace.clients.find(c => c.id === project.clientId)?.name}</div>
        <div className="project-card-title"><div className="project-card-identity"><ProjectLogo project={project}/><h2>{project.acronym}</h2></div><span className="project-arrow"><ArrowUpRight/></span></div>{project.jems?.projectId&&<div className="project-jems-id">{project.jems.projectId}</div>}
        <p className="project-name">{project.name}</p>
        <div className="project-dates"><CalendarDays/>{date(project.start)} — {date(project.end)}</div>
        <div className="project-card-footer"><span>Budget éligible<strong className="num">{currency(project.eligibleBudget)}</strong></span><span>{project.periods.length} périodes</span></div>
      </button>)}
    </div>
    {!projects.length && <div className="project-empty"><FolderOpen/><h2>{workspace.projects.length ? "Aucun projet trouvé" : "Votre premier projet"}</h2><p>{workspace.projects.length ? "Essayez un autre nom ou un autre client." : "Importez votre fichier JEMS : le client et son budget seront créés à partir de l’export."}</p></div>}
  </section>;
}
