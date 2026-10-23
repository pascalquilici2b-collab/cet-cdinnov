import {Loading} from './loading';
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {Projects} from './market-projects';
import {FolderKanban,FileText,FileSpreadsheet,FileImage,Upload as UploadIcon,Sparkles,Settings2,Files,Tags,Gauge,CalendarDays,ListChecks,TriangleAlert,History as HistoryIcon,Check,Plus,Search,RefreshCw,Download,ArrowLeft,ChevronRight,ChevronDown} from 'lucide-react';
import './market-projects.css';
import './markets-apple.css';
import './markets-import.css';
import {ClientAvatar} from './billing-client-avatar';
import {ActivityBadge} from './activity-select';
import {marketActivity} from '../project-activity';
import {Help} from './billing-help';
import {
  TYPES,
  UNITS,
  BILLING,
  CONDITIONS,
  activationBlockers,
  money,
  marketTracking,
} from "../../marches/domain.mjs";
import type {
  MarketsProps,
  MarketsSnapshot,
  Market,
  Rule,
  RuleSource,
  AnalysisResult,
} from "./markets-contracts";
const labels: Record<string, string> = {
  draft: "En préparation",
  validated: "Paramétrage validé",
  archived: "Archivé",
};
const tabs: Record<string, string> = {
  setup: "Assistant",
  summary: "Fiche marché",
  projects: "Projets & commandes",
  documents: "Pièces",
  prices: "Tarifs",
  ceilings: "Plafonds",
  periods: "Périodes",
  conditions: "Conditions",
  issues: "Points à confirmer",
  history: "Historique",
};
const kinds: Record<string, string> = {
  ae: "Acte d’engagement",
  price: "Bordereau de prix",
  clauses: "Clauses / CCTP / CCAP",
  notification: "Notification",
  amendment: "Avenant",
  renewal: "Reconduction",
  offer: "Offre / devis",
  order: "Bon de commande",
  other: "Autre pièce",
};
const Busy = createContext(false);
const amount = (value: number | null) =>
  value == null ? "" : (value / 100).toFixed(2);
function Button(
  props: ComponentProps<"button"> & {
    [key: `data-${string}`]: string | number | undefined;
  },
) {
  const busy = useContext(Busy);
  return (
    <button
      type="button"
      {...props}
      disabled={
        props.disabled || (busy && props["data-action"] !== "stop-analysis")
      }
    />
  );
}
interface FieldProps {
  path: string;
  label: string;
  value: string | number | boolean | null | undefined;
  type?: string;
  options?: Record<string, string>;
  wide?: boolean;
  help?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
  list?: string;
}
function Field({
  path,
  label,
  value,
  type = "text",
  options,
  wide = false,
  help = "",
  required = false,
  placeholder = "",
  min,
  max,
  step,
  list,
}: FieldProps) {
  const disabled = useContext(Busy),
    id = "mk-" + path.replaceAll(".", "-"),
    attrs = { id, "data-path": path, required, disabled };
  return (
    <div
      className={
        "mk-field " +
        (wide ? "mk-wide " : "") +
        (type === "checkbox" ? "mk-check" : "")
      }
    >
      <span className="mk-field-label"><label htmlFor={id}>{label}{required ? " *" : ""}</label>{help&&<Help label={label} text={help}/>}</span>
      {options ? (
        <select {...attrs} defaultValue={String(value ?? "")}>
          {Object.entries(options).map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea {...attrs} rows={3} defaultValue={String(value ?? "")} />
      ) : type === "checkbox" ? (
        <input {...attrs} type="checkbox" defaultChecked={!!value} />
      ) : (
        <input
          {...attrs}
          type={type}
          defaultValue={String(value ?? "")}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          list={list}
        />
      )}
    </div>
  );
}
function Source({
  prefix,
  source,
  docs,
}: {
  prefix: string;
  source: RuleSource;
  docs: MarketsSnapshot["docs"];
}) {
  return (
    <div className="mk-source">
      <Field
        path={prefix + ".source.documentId"}
        label="Pièce source"
        value={source?.documentId}
        options={{
          "": "Choisir une pièce importée",
          ...Object.fromEntries(docs.map((d) => [d.id, d.name])),
        }}
      />
      <Field
        path={prefix + ".source.locator"}
        label="Page / article / cellule"
        value={source?.locator}
        placeholder="Ex. page 2, article 3"
      />
      <Field
        path={prefix + ".source.note"}
        label="Observation de lecture"
        value={source?.note}
        wide
        type="textarea"
      />
    </div>
  );
}
function RuleCard({
  prefix,
  row,
  index,
  docs,
  children,
}: {
  prefix: string;
  row: Rule & { label: string };
  index: number;
  docs: MarketsSnapshot["docs"];
  children: ReactNode;
}) {
  const busy = useContext(Busy);
  const [initiallyOpen] = useState(!row.source?.documentId);
  return (
    <article className="mk-rule">
      <div className="mk-rule-top">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{row.label || "Nouvelle règle"}</strong>
        <Button className="mk-link" data-remove={prefix}>
          Retirer
        </Button>
      </div>
      <div className="mk-fields">{children}</div>
      <details className="mk-proof" open={initiallyOpen || undefined}>
        <summary>
          Source et validation{" "}
          {row.status === "validated" ? "· vérifiée" : "· à vérifier"}
        </summary>
        <Source prefix={prefix} source={row.source} docs={docs} />
        <label className="mk-review">
          <input
            type="checkbox"
            data-review={prefix}
            key={row.status}
            defaultChecked={row.status === "validated"}
            disabled={busy}
          />{" "}
          J’ai vérifié cette règle dans la pièce source
        </label>
      </details>
    </article>
  );
}
function Section({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mk-section-title">
      <h2>{title}</h2>
      {children&&<Help label={title} text={String(children)}/>}
    </div>
  );
}
function Summary({ s, m }: { s: MarketsSnapshot; m: Market }) {
  const clients = [
    ...new Set([
      ...s.clients.map((c) => c.name),
      ...s.rows.map((r) => r.clientName),
    ]),
  ];
  return (
    <>
      <MarketTracking m={m}/>
      <Section title="Identité et règles générales" />
      <div className="mk-fields">
        <Field
          path="title"
          label="Objet du marché"
          value={m.title}
          wide
          required
        />
        <Field
          path="reference"
          label="Référence du marché"
          value={m.reference}
          placeholder="Référence de l’acte d’engagement"
        />
        <Field
          path="clientName"
          label="Client contractant"
          value={m.clientName}
          required
          list="mkClients"
        />
        <Field
          path="type"
          label="Type de contrat"
          value={m.type}
          options={TYPES}
        />
        <Field path="startBasis" label="Démarrage du marché" value={m.startBasis||''} options={{'':'Choisir',notification:'À notification',first_order:'Au premier bon de commande',date:'Date de démarrage'}}/>
        {m.startBasis==='date'&&<Field path="startDate" label="Date de démarrage" type="date" value={m.startDate} required/>}
        <Field path="initialDurationMonths" label="Durée initiale du marché" value={m.initialDurationMonths} options={{'':'Choisir','12':'12 mois','24':'24 mois','36':'36 mois'}}/>
        <Field path="maximumMinor" label="Montant maximum contractuel (€ HT)" value={amount(m.maximumMinor??null)}/>
        <Field
          path="notificationDate"
          label="Date portée sur la notification"
          value={m.notificationDate}
          type="date"
          help="À distinguer de la date de réception et du début d’exécution."
        />
        <Field
          path="periodBasis"
          label="Définition des périodes"
          value={m.periodBasis}
          options={{
            unknown: "À confirmer",
            notification: "Anniversaires de notification / réception",
            calendar: "Années civiles",
            custom: "Dates contractuelles spécifiques",
          }}
        />
        <Field
          path="renewalMode"
          label="Reconduction"
          value={m.renewalMode}
          options={{
            unknown: "À confirmer",
            none: "Sans reconduction",
            tacit: "Tacite",
            express: "Expresse",
          }}
        />
        <Field
          path="renewalCount"
          label="Nombre de reconductions prévues"
          value={m.renewalCount}
          type="number"
          min={0}
          max={20}
          step="1"
        />
        <Field
          path="noMinimum"
          label="Marché sans minimum confirmé"
          value={m.noMinimum}
          type="checkbox"
        />
        <Field
          path="minimumMinor"
          label="Minimum contractuel (€ HT)"
          value={amount(m.minimumMinor)}
          help="Laisser vide si inconnu. Ne crée aucun droit à facturer."
        />
        <Field
          path="feesIncluded"
          label="Frais de mission et de déplacement inclus"
          value={m.feesIncluded}
          type="checkbox"
          wide
        />
        <Field
          path="notes"
          label="Notes et conditions particulières"
          value={m.notes}
          type="textarea"
          wide
        />
      </div>
      <datalist id="mkClients">
        {clients.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
function Prices({ s, m }: { s: MarketsSnapshot; m: Market }) {
  const [selected,setSelected]=useState(()=>m.prices.find(p=>!p.label)?.id||m.prices.at(-1)?.id||'');
  return (
    <>
      <Section title="Grille des tarifs" />
      {!!m.prices.length&&<label className="mk-field">Tarif<select aria-label="Tarif du BPU" value={selected} onChange={e=>setSelected(e.target.value)}>{m.prices.map((p,i)=><option key={p.id} value={p.id}>{p.label||'Nouveau tarif'}{p.profile?' · '+p.profile:''} · {money(p.amountMinor)}</option>)}</select></label>}
      {m.prices.map((r, i) => {
        if(r.id!==selected)return null;
        const p = "prices." + i;
        return (
          <RuleCard key={r.id} prefix={p} row={r} index={i} docs={s.docs}>
            <Field
              path={p + ".label"}
              label="Prestation"
              value={r.label}
              required
              wide
            />
            <Field
              path={p + ".amountMinor"}
              label="Prix unitaire HT (€)"
              value={amount(r.amountMinor)}
            />
            <Field
              path={p + ".vatRate"}
              label="Taux TVA (%)"
              value={r.vatRate==null?'':String(r.vatRate)}
              placeholder="À renseigner"
            />
            <Field
              path={p + ".unit"}
              label="Unité"
              value={r.unit}
              options={Object.fromEntries(Object.entries(UNITS).filter(([unit])=>unit!=='km'||r.unit==='km'))}
            />
            <Field
              path={p + ".profile"}
              label="Profil"
              value={r.profile}
              placeholder="Tous profils, senior, junior…"
            />
            <Field
              path={p + ".location"}
              label="Lieu / modalité"
              value={r.location}
              placeholder="Corse, étranger, distance…"
            />
            <Field
              path={p + ".startDate"}
              label="Valable à partir du"
              value={r.startDate}
              type="date"
              help="Vide : pas de borne spécifique au tarif."
            />
            <Field
              path={p + ".endDate"}
              label="Valable jusqu’au"
              value={r.endDate}
              type="date"
            />
            <Field
              path={p + ".notes"}
              label="Précision"
              value={r.notes}
              type="textarea"
              wide
            />
          </RuleCard>
        );
      })}
      <Button className="mk-secondary" data-add="prices">
        + Ajouter un tarif
      </Button>
      <Button className="mk-secondary" data-add-expense="mission">+ Frais de mission</Button>
      <Button className="mk-secondary" data-add-expense="travel">+ Frais de déplacement</Button>
    </>
  );
}
function MarketTracking({m}:{m:Market}){
 const t=marketTracking(m),consumed=m.tracking?.quotedMinor??0,ratio=t.maximumMinor?100*consumed/t.maximumMinor:0;
 return <section className="mk-tracking" aria-label="Suivi actualisé du marché">
  <h2><Gauge size={19}/> Suivi actualisé du marché</h2>
  <div className="mk-tracking-values"><div><strong>{t.orderCount}</strong><span>Bons de commande reçus <span tabIndex={0} title="Bons datés, y compris ceux des projets archivés. L’archivage ne supprime pas un engagement contractuel." aria-label="Calcul des commandes">ⓘ</span></span></div><div><strong>{money(consumed)}</strong><span>Devis envoyés HT <span tabIndex={0} title="Prévisionnel des devis envoyés ou acceptés, même échus. Les refus, versions remplacées et brouillons sont exclus. Les commandes et factures ne s’y ajoutent pas." aria-label="Calcul des devis envoyés">ⓘ</span></span></div><div><strong>{money(t.maximumMinor)}</strong><span>Maximum contractuel HT</span></div></div>
  {t.maximumMinor!==null&&<><progress aria-label="Consommation prévisionnelle par devis envoyés" value={Math.min(consumed,t.maximumMinor)} max={t.maximumMinor||1}/><small>{ratio.toLocaleString('fr-FR',{maximumFractionDigits:1})} % prévisionnel{consumed>t.maximumMinor?' · Maximum dépassé':''}</small></>}
  {t.unknownAmounts>0&&<small role="status">{t.unknownAmounts} bon(s) sans montant : consommation incomplète.</small>}
  {t.startDate&&<small>Début d’exécution : {t.startDate.split('-').reverse().join('/')}</small>}
 </section>;
}
function Ceilings({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Plafonds contractuels">
        Les limites sont paramétrées ici. Le disponible sera calculé après
        reprise des commandes ; aucun solde n’est présumé.
      </Section>
      {m.ceilings.map((r, i) => {
        const p = "ceilings." + i;
        return (
          <RuleCard key={r.id} prefix={p} row={r} index={i} docs={s.docs}>
            <Field
              path={p + ".label"}
              label="Intitulé"
              value={r.label}
              required
              wide
            />
            <Field
              path={p + ".amountMinor"}
              label="Montant maximum (€)"
              value={amount(r.amountMinor)}
            />
            <Field
              path={p + ".basis"}
              label="Base du montant"
              value={r.basis}
              options={{ HT: "Hors taxes", TTC: "Toutes taxes comprises" }}
            />
            <Field
              path={p + ".scope"}
              label="Portée du plafond"
              value={r.scope}
              options={{
                annual: "Par période annuelle du marché",
                contract: "Total du contrat",
                period: "Période spécifique",
              }}
            />
            <Field
              path={p + ".periodId"}
              label="Période spécifique (si applicable)"
              value={r.periodId}
              options={{
                "": "Aucune",
                ...Object.fromEntries(m.periods.map((p) => [p.id, p.label])),
              }}
            />
            <Field
              path={p + ".consumptionBasis"}
              label="Consommation du plafond"
              value={r.consumptionBasis}
              options={{
                orders: "Engagements / commandes",
                invoices: "Factures — seulement si prévu au contrat",
              }}
            />
            <Field
              path={p + ".notes"}
              label="Précision"
              value={r.notes}
              type="textarea"
              wide
            />
          </RuleCard>
        );
      })}
      <Button className="mk-secondary" data-add="ceilings">
        + Ajouter un plafond
      </Button>
    </>
  );
}
function Periods({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Périodes contractuelles">
        Renseignez les dates effectives et leur justification. Une notification
        datée ne prouve pas sa date de réception. Aucune reconduction
        automatique.
      </Section>
      {m.periods.map((r, i) => {
        const p = "periods." + i;
        return (
          <RuleCard key={r.id} prefix={p} row={r} index={i} docs={s.docs}>
            <Field
              path={p + ".label"}
              label="Période"
              value={r.label}
              required
              wide
            />
            <Field
              path={p + ".startDate"}
              label="Début"
              value={r.startDate}
              type="date"
            />
            <Field
              path={p + ".endDate"}
              label="Fin (incluse)"
              value={r.endDate}
              type="date"
            />
            <Field
              path={p + ".decision"}
              label="Justification de prise d’effet / reconduction"
              value={r.decision}
              type="textarea"
              wide
            />
          </RuleCard>
        );
      })}
      <Button className="mk-secondary" data-add="periods">
        + Ajouter une période
      </Button>
    </>
  );
}
function Conditions({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Facturation et conditions">
        Échéances, paiement, bons de commande, TVA, frais, révision, livrables
        et relevés d’intervention. Chaque condition peut être ajustée librement.
      </Section>
      {(m.conditions || []).map((r, i) => {
        const p = "conditions." + i;
        return (
          <RuleCard key={r.id} prefix={p} row={r} index={i} docs={s.docs}>
            <Field
              path={p + ".category"}
              label="Rubrique"
              value={r.category}
              options={CONDITIONS}
            />
            <Field
              path={p + ".label"}
              label="Intitulé"
              value={r.label}
              required
            />
            <Field
              path={p + ".value"}
              label="Règle applicable"
              value={r.value}
              type="textarea"
              wide
              required
            />
          </RuleCard>
        );
      })}
      <Button className="mk-secondary" data-add="conditions">
        + Ajouter une condition
      </Button>
    </>
  );
}
function Issues({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Points à confirmer">
        Renseignez la décision retenue, puis cliquez sur « Valider ce point ».
        La décision est enregistrée immédiatement. Ajustez aussi les paramètres
        concernés si nécessaire.
      </Section>
      {!m.issues.length && (
        <div className="mk-empty">Aucun point à confirmer.</div>
      )}
      {m.issues.map((r, i) => {
        const p = "issues." + i;
        return (
          <article className="mk-rule" key={r.id}>
            <div className="mk-rule-top">
              <strong>Point {i + 1}</strong>
              <Button className="mk-link" data-remove={p}>
                Retirer
              </Button>
            </div>
            <div className="mk-fields">
              <Field
                path={p + ".title"}
                label="Sujet"
                value={r.title}
                wide
                required
              />
              <Field
                path={p + ".detail"}
                label="Constat documentaire"
                value={r.detail}
                wide
                type="textarea"
              />
              <Field
                path={p + ".blocking"}
                label="Bloque la validation du paramétrage"
                value={r.blocking}
                type="checkbox"
              />
              <span className="mk-status">
                {r.status === "resolved" ? "Point validé" : "À confirmer"}
              </span>
              <Field
                path={p + ".resolution"}
                label="Décision retenue et justification"
                value={r.resolution}
                wide
                type="textarea"
              />
            </div>
            <details className="mk-proof">
              <summary>Pièce de référence</summary>
              <Source prefix={p} source={r.source} docs={s.docs} />
            </details>
            <div className="mk-rule-actions">
              <Button
                className={
                  r.status === "resolved" ? "mk-secondary" : "mk-primary"
                }
                data-resolve={i}
              >
                {r.status === "resolved"
                  ? "Rouvrir ce point"
                  : "Valider ce point"}
              </Button>
              <small>Décision et historique sauvegardés.</small>
            </div>
          </article>
        );
      })}
      <Button className="mk-secondary" data-add="issues">
        + Ajouter un point à confirmer
      </Button>
    </>
  );
}
function Upload({ setup = false }: { setup?: boolean }) {
  const busy = useContext(Busy);
  return (
    <div className="mk-upload">
      <label>
        Classement
        <select
          id="mkDocKind"
          defaultValue="auto"
          disabled={busy}
        >
          <option value="auto">Automatique</option>
          {Object.entries(kinds).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <label className="mk-file">
        <UploadIcon size={17}/> {setup ? "Ajouter le dossier" : "Ajouter des pièces"}
        <input
          id="mkFiles"
          data-market-files
          type="file"
          multiple
          accept=".zip,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
          disabled={busy}
        />
      </label>
      <Help label="Formats d’import" text="ZIP ou pièces ajoutées progressivement : PDF et scans, Word, Excel, images et texte. 5 Mo par pièce, 50 pièces et 50 Mo par marché. Qwen complète les champs reconnus ; les sources restent consultables et les règles à vérifier."/>
    </div>
  );
}
function FileIcon({name}:{name:string}){
 const ext=name.split('.').at(-1)?.toLowerCase()||'';
 const type=ext==='pdf'?'pdf':['xlsx','xls','csv'].includes(ext)?'xls':['jpg','jpeg','png'].includes(ext)?'image':['docx','doc'].includes(ext)?'doc':'file';
 const Glyph=type==='xls'?FileSpreadsheet:type==='image'?FileImage:FileText;
 return <span className={'mk-file-icon mk-file-icon-'+type} aria-label={'Fichier '+ext.toUpperCase()}><Glyph size={25}/>{type!=='image'&&<b>{type==='file'?'TXT':type.toUpperCase()}</b>}</span>;
}
function Documents({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Pièces du marché">
        Originaux conservés, empreinte contrôlée et doublons détectés. Maximum 5
        Mo par pièce.
      </Section>
      {m.version ? (
        <Upload />
      ) : (
        <div className="mk-message">
          Enregistrez la fiche pour lui rattacher les pièces du marché.
        </div>
      )}
      <div id="mkUploadStatus" role="status">
        {s.uploadStatus}
      </div>
      {s.docs.length ? (
        <div className="mk-doc-list">
          {s.docs.map((d) => (
            <article key={d.id}>
              <FileIcon name={d.name}/><div className="mk-doc-info">
                <strong>{d.name}</strong>
                <small>
                  {kinds[d.kind] || d.kind} ·{" "}
                  {(d.size / 1024 / 1024).toFixed(2)} Mo ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString("fr-FR")}
                </small>
                <small>
                  {s.readings.find(r=>r.id===d.id)?.read?'Lecture disponible':'À analyser'}
                </small>
              </div>
              <div className="mk-doc-actions">
                <Button className="mk-icon-button" data-download={d.id} aria-label={'Télécharger '+d.name} title="Télécharger">
                  <Download size={17}/>
                </Button>
                <Button className="mk-secondary" data-analyse={d.id}><Sparkles size={15}/>Analyser</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mk-empty">Aucune pièce importée.</div>
      )}
      {s.docs.length>0&&<div className="mk-document-analysis">{s.analysis&&s.analysis.status!=='ready'&&!s.analysis.stale?<Button className="mk-secondary" data-action="resume-analysis"><Sparkles size={16}/>Reprendre l’analyse</Button>:<Button className="mk-secondary" data-action="analyse-all"><Sparkles size={16}/>Analyser le dossier</Button>}<Help label="Lecture du dossier" text="Qwen remplit les champs disponibles dans les onglets du marché. Les données déjà saisies sont conservées ; les divergences apparaissent dans les points à confirmer."/></div>}
      {s.analysis?.result&&<details className="mk-analysis-details"><summary><ListChecks size={17}/>Résultats de lecture</summary><Proposals result={s.analysis.result} s={s} m={m}/></details>}
    </>
  );
}
function History({ s, m }: { s: MarketsSnapshot; m: Market }) {
  return (
    <>
      <Section title="Historique des versions">
        Chaque enregistrement conserve l’auteur, la date et l’état de la fiche.
      </Section>
      {!m.version ? (
        <div className="mk-empty">La fiche n’a pas encore été enregistrée.</div>
      ) : !s.history ? (
        <Button className="mk-secondary" data-action="history">
          Charger l’historique
        </Button>
      ) : (
        s.history.map((v) => (
          <article className="mk-history" key={v.version}>
            <strong>
              Version {v.version} · {labels[v.market.status]}
            </strong>
            <span>
              {new Date(v.updatedAt).toLocaleString("fr-FR")} · {v.updatedBy}
            </span>
            <small>
              {v.market.prices.length} tarifs · {v.market.ceilings.length}{" "}
              plafonds · {v.market.periods.length} périodes ·{" "}
              {v.market.issues.filter((x) => x.status === "open").length} points
              à confirmer
            </small>
            <Button className="mk-link" data-version={v.version}>
              Exporter cette version
            </Button>
          </article>
        ))
      )}
    </>
  );
}
const factLabels: Record<string, string> = {
  title: "Objet",
  reference: "Référence",
  clientName: "Client",
  type: "Type",
  billingMode: "Facturation",
  notificationDate: "Notification",
  periodBasis: "Périodes",
  renewalMode: "Reconduction",
  renewalCount: "Reconductions prévues",
  noMinimum: "Sans minimum",
  minimumMinor: "Minimum contractuel",
  feesIncluded: "Frais inclus",
  startBasis:"Démarrage",startDate:"Date de démarrage",initialDurationMonths:"Durée initiale (mois)",maximumMinor:"Maximum contractuel HT",
};
const factValue=(field:string,value:unknown)=>field.endsWith('Minor')?money(value as number):typeof value==='boolean'?(value?'Oui':'Non'):field==='startBasis'?({notification:'À notification',first_order:'Au premier bon de commande',date:'Date de démarrage'}[String(value)]||String(value)):String(value);
function Proposals({
  result,
  s,
  m,
}: {
  result: AnalysisResult;
  s: MarketsSnapshot;
  m: Market;
}) {
  const busy = useContext(Busy),
    rows = [
      ...result.prices.map((x) => ({
        label: x.label,
        value:
          money(x.amountMinor) +
          " HT / " +
          ((UNITS as Record<string, string>)[x.unit] || x.unit),
        source: x.source,
      })),
      ...result.ceilings.map((x) => ({
        label: x.label,
        value: money(x.amountMinor) + " " + x.basis,
        source: x.source,
      })),
      ...result.periods.map((x) => ({
        label: x.label,
        value:
          (x.startDate || "Début à préciser") +
          " → " +
          (x.endDate || "Fin à préciser"),
        source: x.source,
      })),
      ...result.conditions.map((x) => ({
        label: x.label,
        value: x.value,
        source: x.source,
      })),
      ...result.issues.map((x) => ({
        label: x.title,
        value: x.detail,
        source: x.source,
      })),
      ...(result.projects||[]).map(x=>({label:x.name,value:[x.code,x.programme,(x.orders?.length||0)+' bon(s) de commande'].filter(Boolean).join(' · '),source:{documentId:'',locator:'',note:x.notes}})),
    ];
  return (
    <div className="mk-ai-result">
      <h3>Propositions de paramétrage</h3>
      <div className="mk-ai-counts">
        {(
          ["facts", "prices", "ceilings", "periods", "conditions", "projects", "issues"] as const
        ).filter(key=>result[key]?.length).map((key) => (
          <div key={key}>
            <strong>{result[key]?.length || 0}</strong>
            <span>
              {
                {
                  facts:"champs",projects:"projets",
                  prices: "tarifs",
                  ceilings: "plafonds",
                  periods: "périodes",
                  conditions: "conditions",
                  issues: "points à confirmer",
                }[key]
              }
            </span>
          </div>
        ))}
      </div>
      <p>
        {result.coverage.filter((d) => d.selected).length} /{" "}
        {result.coverage.length} pièce(s) incluse(s).{" "}
        {result.coverage.some((d) => d.selected && !d.complete)
          ? "Attention : le dossier n’a pas été lu intégralement. Les pièces à vérifier sont signalées."
          : "Toutes les pièces sélectionnées ont été parcourues. Les valeurs restent à vérifier."}
      </p>
      {result.coverage.flatMap((d, i) =>
        (d.warnings || []).map((w, j) => (
          <p key={i + "-" + j} className="mk-muted">
            {d.name} : {w}
          </p>
        )),
      )}
      <div className="mk-ai-proposals">
        {(result.facts || []).map((f, i) => (
          <div key={"fact-" + i}>
            <strong>{factLabels[f.field] || f.field}</strong>
            <span>
              {factValue(f.field,f.value)}
              {f.conflict ? " · contradictoire" : ""}
            </span>
            <small>{f.source.note}</small>
          </div>
        ))}
        {rows.map((x, i) => (
          <div key={"rule-" + i}>
            <strong>{x.label}</strong>
            <span>{x.value}</span>
            <small>
              {s.docs.find((d) => d.id === x.source.documentId)?.name || ""} ·{" "}
              {x.source.locator} — {x.source.note}
            </small>
          </div>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <details className="mk-proof">
          <summary>{result.warnings.length} observation(s) de lecture</summary>
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      )}
      {s.appliedAnalysisId===s.analysis?.id?<p className="mk-applied"><Check size={16}/>Champs reconnus enregistrés dans la fiche</p>:<div className="mk-apply">
        <p>
          <strong>Les saisies existantes sont conservées.</strong> Les nouvelles
          règles et les points à vérifier seront ajoutés. Choisissez
          explicitement les rubriques à remplacer si vous souhaitez reprendre le
          paramétrage.
        </p>
        <details className="mk-proof">
          <summary>Rubriques à remplacer par les propositions</summary>
          {Object.entries({
            summary: "Identité et règles générales",
            prices: "Tarifs",
            ceilings: "Plafonds",
            periods: "Périodes",
            conditions: "Conditions de facturation",
          }).map(([key, title]) => (
            <label key={key} className="mk-check">
              <input
                type="checkbox"
                data-ai-replace={key}
                defaultChecked={
                  key === "summary" && m.title === "Marché à identifier"
                }
                disabled={busy}
              />
              {title}
            </label>
          ))}
        </details>
        <Button className="mk-primary" data-action="apply-analysis" disabled={s.analysis?.stale}>
          Appliquer les propositions à la fiche
        </Button>
        <small>
          Vous pourrez tout ajuster avant d’enregistrer. Aucune règle ne sera
          marquée comme vérifiée automatiquement.
        </small>
      </div>}
    </div>
  );
}
function Setup({ s, m }: { s: MarketsSnapshot; m: Market }) {
  const r = s.analysis,
    busy = useContext(Busy);
  return (
    <>
      <Section title="Assistant de paramétrage">L’import lance automatiquement la lecture et complète la fiche. Vérifiez ensuite les règles dans leurs onglets.</Section>
      <ol className="mk-steps">
        {[
          "Ajouter les pièces",
          "Remplissage automatique",
          "Vérifier et ajuster",
        ].map((title, i) => (
          <li key={title}>
            <b>{i + 1}</b>
            <span>{title}</span>
          </li>
        ))}
      </ol>
      {!m.version && (
        <details className="mk-proof">
          <summary>Identifier le dossier maintenant (facultatif)</summary>
          <div className="mk-fields">
            <Field path="title" label="Objet du marché" value={m.title} />
            <Field
              path="clientName"
              label="Client contractant"
              value={m.clientName}
            />
          </div>
        </details>
      )}
      <Upload setup />
      <div id="mkUploadStatus" role="status">
        {s.uploadStatus}
      </div>
      {s.docs.length ? (
        <div className="mk-source-selection">
          {s.docs.map((d) => {
            const reading = s.readings.find((x) => x.id === d.id);
            return (
              <label key={d.id}>
                <input
                  type="checkbox"
                  data-ai-document={d.id}
                  defaultChecked
                  disabled={busy}
                />
                <span>
                  <strong>{d.name}</strong>
                  <small>
                    {reading?.read
                      ? reading.complete
                        ? "Texte prêt pour l’analyse"
                        : "Lecture à vérifier"
                      : "Texte préparé au lancement"}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        null
      )}
      <div className="mk-ai-launch">
        <div>
          <strong>Analyse des pièces</strong><Help label="Analyse des pièces" text={'Les propositions sont reliées aux pièces et restent à vérifier.'+(s.ai?' '+Math.floor((s.ai.remaining/s.ai.dailyBudget)*100)+' % du budget de lecture disponible aujourd’hui.':'')}/>
        </div>
        <div>
          <Button
            className="mk-primary"
            data-action="run-analysis"
            disabled={!s.docs.length}
          >
            {r && r.status !== "ready"
              ? "Reprendre l’analyse"
              : "Analyser les pièces sélectionnées"}
          </Button>
          <Button
            className="mk-link"
            data-action="stop-analysis"
            hidden={!s.busy}
          >
            Arrêter après ce passage
          </Button>
        </div>
      </div>
      <div
        id="mkAiProgress"
        className="mk-ai-progress"
        role="status"
        aria-live="polite"
      >
        {s.progress ||
          (r
            ? r.status === "ready"
              ? "Analyse disponible : vérifiez les propositions avant de les appliquer."
              : r.completed +
                " / " +
                r.total +
                " passages traités" +
                (r.error ? " · " + r.error : "")
            : "")}
      </div>
      {r?.result && <Proposals result={r.result} s={s} m={m} />}
    </>
  );
}
function MarketList({ state: s, onQuery }: MarketsProps) {
  const [query,setQuery]=useState(s.query),[client,setClient]=useState('');
  const q=query.toLocaleLowerCase('fr'),clients=[...new Set(s.rows.map(m=>m.clientName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const rows=s.rows.filter(m=>(!client||m.clientName===client)&&[m.title,m.reference,m.clientName].some(v=>v.toLocaleLowerCase('fr').includes(q)));
  return <>
    <div className="mk-heading"><h1>Marchés et contrats</h1><Button className="mk-primary" data-action="new"><Plus size={17}/>Nouveau marché</Button></div>
    <div className="mk-overview">
      <div><span>Marchés suivis</span><strong>{s.rows.filter(m=>m.status!=='archived').length}</strong></div>
      <div><span>En cours de validité</span><strong>{s.rows.filter(m=>marketActivity(m).state==='active').length}</strong></div>
      <div><span>Devis envoyés HT</span><strong>{money(s.rows.reduce((n,m)=>n+(m.tracking?.quotedMinor||0),0))}</strong></div>
    </div>
    <div className="mk-list-tools">
      <label className="mk-search" htmlFor="mkSearch"><Search size={17}/><input id="mkSearch" type="search" aria-label="Rechercher un marché" value={query} onChange={e=>{setQuery(e.target.value);onQuery(e.target.value);}} placeholder="Client, référence ou objet…" disabled={s.busy}/></label>
      <select aria-label="Filtrer les marchés par client" value={client} onChange={e=>setClient(e.target.value)}><option value="">Tous les clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select>
      <Button className="mk-icon-button" aria-label="Actualiser les marchés" title="Actualiser" data-action="refresh"><RefreshCw size={17}/></Button>
    </div>
    <div id="mkMarketList">{s.busy?<Loading label="Chargement des marchés…"/>:!rows.length?<div className="mk-empty">{query||client?'Aucun marché ne correspond à ces filtres.':'Aucun marché pour le moment.'}</div>:<div className="mk-table-wrap"><table className="mk-table">
      <thead><tr><th>Marché</th><th>Client</th><th>Devis envoyés / maximum HT</th><th>Validité</th><th><span className="mk-sr-only">Ouvrir</span></th></tr></thead>
      <tbody>{rows.map(m=>{const maximum=marketTracking(m).maximumMinor,consumed=m.tracking?.quotedMinor||0;return <tr key={m.id}>
        <td><Button className="mk-market-link" data-open={m.id}><strong>{m.reference||'Sans référence'}</strong><span>{m.title||'Nouveau marché'}</span></Button></td>
        <td><div className="mk-client"><ClientAvatar name={m.clientName}/><span>{m.clientName||'À renseigner'}</span></div></td>
        <td className="mk-consumption"><strong>{money(consumed)}</strong><small> / {maximum===null?'À renseigner':money(maximum)}</small>{maximum!==null&&maximum>0&&<progress aria-label={'Consommation du marché '+(m.reference||m.title)} value={Math.min(consumed,maximum)} max={maximum}/>}</td>
        <td><ActivityBadge activity={marketActivity(m)}/>{m.status==='draft'&&<small className="mk-configuration-state">En préparation</small>}</td>
        <td><Button className="mk-icon-button" data-open={m.id} aria-label={'Ouvrir le marché '+(m.reference||m.title)}><ChevronRight size={18}/></Button></td>
      </tr>;})}</tbody></table></div>}</div>
  </>;
}
function Markets(props: MarketsProps) {
  const s = props.state,
    m = s.current,
    blockers = m ? activationBlockers(m) : [],
    Content =
      (
        {
          setup: Setup,
          summary: Summary,
          projects: Projects,
          documents: Documents,
          prices: Prices,
          ceilings: Ceilings,
          periods: Periods,
          conditions: Conditions,
          issues: Issues,
          history: History,
        } as Record<string, typeof Summary>
      )[s.tab] || Summary;
  return (
    <Busy.Provider value={s.busy}>
      <section
        id="marketRoot"
        className="mk-root"
        data-react-markets
        aria-busy={s.busy}
      >
        {m&&<input id="mkImportFiles" data-market-files type="file" multiple accept=".zip,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.csv" hidden disabled={s.busy}/>}
        <div id="marketMessage">
          {s.error ? (
            <div className="mk-message mk-error" role="alert">
              {s.error}
            </div>
          ) : s.notice ? (
            <div className="mk-message mk-success" role="status">
              <Check size={18} aria-hidden="true"/>
              {s.notice}
            </div>
          ) : null}
        </div>
        {m ? (
          <>
            <div className="mk-heading">
              <div>
                <Button className="mk-link" data-action="back">
                  <ArrowLeft size={16}/> Tous les marchés
                </Button>
                <h1>{m.reference || "Nouveau marché"}</h1><p className="mk-market-title">{m.title}</p>
                <p>
                  {m.clientName || "Client à renseigner"}
                  {m.reference ? " · " + m.reference : ""}
                </p>
              </div>
              <ActivityBadge activity={marketActivity(m)}/>
            </div>
            <div className="mk-editbar">
              <span id="mkSaveState">{!s.dirty&&m.version>0&&<Check size={16} aria-hidden="true"/>}
                {s.dirty
                  ? "Modifications à enregistrer"
                  : m.version
                    ? "Enregistré"
                    : "Nouvelle fiche"}
              </span>
              <div>
                <Button className="mk-secondary mk-import-button" data-action="import"><UploadIcon size={16}/>Importer</Button>
                <Button className="mk-secondary" data-action="export">
                  <Download size={16}/> Exporter
                </Button>
                <Button className="mk-primary" data-action="save">
                  <Check size={17}/> Enregistrer
                </Button>
              </div>
            </div>
            <nav className="mk-tabs" aria-label="Rubriques du marché">
              {['summary','projects','prices','documents','periods','conditions'].map(key=><Button key={key} data-tab={key} aria-current={s.tab===key?'page':'false'}>{(()=>{const Glyph=({summary:FileText,projects:FolderKanban,prices:Tags,documents:Files,periods:CalendarDays,conditions:ListChecks} as Record<string,typeof FileText>)[key];return <Glyph size={16}/>;})()}{tabs[key]}</Button>)}
              <details className="mk-more-tabs"><summary aria-label="Autres rubriques du marché"><Settings2 size={16}/>Plus<ChevronDown size={14}/></summary><div>{['setup','ceilings','issues','history'].map(key=><Button key={key} data-tab={key} aria-current={s.tab===key?'page':'false'}>{(()=>{const Glyph=({setup:Settings2,ceilings:Gauge,issues:TriangleAlert,history:HistoryIcon} as Record<string,typeof FileText>)[key];return <Glyph size={16}/>;})()}{tabs[key]}{key==='issues'&&m.issues.some(x=>x.status==='open')&&<span className="mk-count">{m.issues.filter(x=>x.status==='open').length}</span>}</Button>)}</div></details>
            </nav>
            {(s.progress||s.uploadStatus)&&<div className="mk-import-progress" role="status"><Sparkles size={17}/><span>{s.progress||s.uploadStatus}</span><Button className="mk-link" data-action="stop-analysis">Arrêter</Button></div>}
            <form id="mkForm" noValidate>
              <div className="mk-panel">
                <Content s={s} m={m} />
              </div>
            </form>
            <div className="mk-validation">
              <div>
                <strong>{m.status==='validated'&&<Check size={17}/>} Validation du paramétrage</strong>
                <Help label="Validation du paramétrage" text={blockers.length?'À compléter : '+blockers.join(' ; '):'Les règles indispensables sont renseignées. Vérifiez les sources avant validation.'}/>

              </div>
              <div>
                <Field
                  key={m.status}
                  path="status"
                  label="État de la fiche"
                  value={m.status}
                  options={labels}
                />
              </div>
            </div>
          </>
        ) : (
          <MarketList {...props} />
        )}
      </section>
    </Busy.Provider>
  );
}
export function mountMarkets(element: HTMLElement, props: MarketsProps) {
  const root = createRoot(element);
  let version = 0;
  const update = (next: MarketsProps, reset = true) => {
    if (reset) version++;
    flushSync(() => root.render(<Markets key={version} {...next} />));
  };
  update(props);
  return { update, dispose: () => root.unmount() };
}
