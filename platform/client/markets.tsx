import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  TYPES,
  UNITS,
  BILLING,
  CONDITIONS,
  activationBlockers,
  money,
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
  setup: "Assistant de paramétrage",
  summary: "Fiche marché",
  documents: "Pièces",
  prices: "Tarifs",
  ceilings: "Plafonds",
  periods: "Périodes",
  conditions: "Facturation et conditions",
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
    <label
      className={
        "mk-field " +
        (wide ? "mk-wide " : "") +
        (type === "checkbox" ? "mk-check" : "")
      }
    >
      <span>
        {label}
        {required ? " *" : ""}
      </span>
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
      {help && <small>{help}</small>}
    </label>
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
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mk-section-title">
      <h2>{title}</h2>
      <p>{children}</p>
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
      <Section title="Identité et règles générales">
        Les règles propres au marché seront utilisées par les commandes et la
        facturation.
      </Section>
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
        <Field
          path="billingMode"
          label="Mode de facturation"
          value={m.billingMode}
          options={BILLING}
        />
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
  return (
    <>
      <Section title="Grille des tarifs">
        Un prix par prestation, profil, lieu et période de validité. Les
        quantités estimées du bordereau ne sont pas des jours commandés.
      </Section>
      {m.prices.map((r, i) => {
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
              path={p + ".unit"}
              label="Unité"
              value={r.unit}
              options={UNITS}
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
    </>
  );
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
        {setup ? "Type des pièces" : "Nature de la pièce"}
        <select
          id="mkDocKind"
          defaultValue={setup ? "other" : "ae"}
          disabled={busy}
        >
          {Object.entries(kinds).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <label className="mk-file">
        {setup ? "Ajouter les pièces du marché" : "Importer des pièces"}
        <input
          id="mkFiles"
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
          disabled={busy}
        />
      </label>
      <p>
        Acte d’engagement, bordereau, CCAP/CCTP, offre, notification, avenants,
        reconductions… PDF et scans, Word, Excel, images et texte. 5 Mo par
        pièce.
      </p>
    </div>
  );
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
      <div id="mkSuggestions">
        {s.suggestions && (
          <div className="mk-message">
            <strong>Propositions de lecture à vérifier</strong>
            {!s.suggestions.items.length ? (
              <p>
                Aucun plafond reconnu automatiquement. Consultez la pièce et
                renseignez les règles dans les onglets correspondants.
              </p>
            ) : (
              s.suggestions.items.map((x, i) => (
                <div key={i} className="mk-suggestion">
                  <p>{x.excerpt}</p>
                  <strong>
                    {money(x.value)} {x.basis || "base à confirmer"}
                    {x.annual ? " par an" : ""}
                  </strong>
                  <Button data-suggestion={i} disabled={!x.basis}>
                    Reprendre comme plafond à vérifier
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {s.docs.length ? (
        <div className="mk-doc-list">
          {s.docs.map((d) => (
            <article key={d.id}>
              <div>
                <strong>{d.name}</strong>
                <small>
                  {kinds[d.kind] || d.kind} ·{" "}
                  {(d.size / 1024 / 1024).toFixed(2)} Mo ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString("fr-FR")}
                </small>
                <small>
                  {d.hasText
                    ? "Texte disponible pour la lecture assistée"
                    : "Texte non extrait — lecture manuelle"}
                </small>
              </div>
              <div>
                <Button className="mk-secondary" data-download={d.id}>
                  Télécharger
                </Button>
                {d.hasText && (
                  <Button className="mk-link" data-analyse={d.id}>
                    Lire les propositions
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mk-empty">Aucune pièce importée.</div>
      )}
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
  minimumMinor: "Minimum (centimes)",
  feesIncluded: "Frais inclus",
};
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
    ];
  return (
    <div className="mk-ai-result">
      <h3>Propositions de paramétrage</h3>
      <div className="mk-ai-counts">
        {(
          ["prices", "ceilings", "periods", "conditions", "issues"] as const
        ).map((key) => (
          <div key={key}>
            <strong>{result[key]?.length || 0}</strong>
            <span>
              {
                {
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
        {result.coverage.some((d) => !d.selected || !d.complete)
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
              {String(f.value)}
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
      <div className="mk-apply">
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
        <Button className="mk-primary" data-action="apply-analysis">
          Appliquer les propositions à la fiche
        </Button>
        <small>
          Vous pourrez tout ajuster avant d’enregistrer. Aucune règle ne sera
          marquée comme vérifiée automatiquement.
        </small>
      </div>
    </div>
  );
}
function Setup({ s, m }: { s: MarketsSnapshot; m: Market }) {
  const r = s.analysis,
    busy = useContext(Busy);
  return (
    <>
      <div className="mk-setup-heading">
        <span className="mk-eyebrow">Du dossier au paramétrage</span>
        <h2>Déposez les pièces. Vérifiez les règles.</h2>
        <p>
          L’assistant lit les documents ensemble et prépare votre marché. Les
          paramètres restent modifiables dans les rubriques ci-dessus.
        </p>
      </div>
      <ol className="mk-steps">
        {[
          "Ajouter les pièces",
          "Analyser le dossier",
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
        <p className="mk-muted">
          Commencez par ajouter les documents disponibles. L’assistant
          complétera l’identité du marché.
        </p>
      )}
      <div className="mk-ai-launch">
        <div>
          <strong>Analyse assistée du dossier</strong>
          <p>
            Le texte sélectionné est traité sur Cloudflare par un modèle ouvert.
            Les propositions sont reliées aux pièces ; les informations absentes
            ou contradictoires restent à confirmer.
          </p>
          <small>
            {s.ai?.model || "Modèle ouvert"} ·{" "}
            {s.ai
              ? Math.floor((s.ai.remaining / s.ai.dailyBudget) * 100) +
                " % du budget de lecture disponible aujourd’hui. "
              : ""}
            À la limite, l’analyse se met en pause. Les passages terminés sont
            conservés.
          </small>
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
  const [query, setQuery] = useState(s.query),
    q = query.toLocaleLowerCase("fr"),
    rows = s.rows.filter((m) =>
      [m.title, m.reference, m.clientName].some((v) =>
        v.toLocaleLowerCase("fr").includes(q),
      ),
    );
  return (
    <>
      <div className="mk-heading">
        <div>
          <span className="mk-eyebrow">Référentiel contractuel</span>
          <h1>Marchés et contrats</h1>
          <p>Les pièces, les prix et les limites qui encadrent vos missions.</p>
        </div>
        <Button className="mk-primary" data-action="new">
          + Nouveau marché
        </Button>
      </div>
      <div className="mk-overview">
        <div>
          <strong>
            {s.rows.filter((r) => r.status !== "archived").length}
          </strong>
          <span>marchés suivis</span>
        </div>
        <div>
          <strong>{s.rows.filter((r) => r.status === "draft").length}</strong>
          <span>en préparation</span>
        </div>
        <div>
          <strong>
            {s.rows.reduce(
              (n, r) => n + r.issues.filter((x) => x.status === "open").length,
              0,
            )}
          </strong>
          <span>points à confirmer</span>
        </div>
        <p>
          Le plafond contractualisé et le disponible sont distincts. La reprise
          des commandes permettra le calcul de consommation.
        </p>
      </div>
      <div className="mk-list-tools">
        <label htmlFor="mkSearch">Rechercher un marché</label>
        <input
          id="mkSearch"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQuery(e.target.value);
          }}
          placeholder="Client, référence ou objet"
          disabled={s.busy}
        />
        <Button className="mk-secondary" data-action="refresh">
          Actualiser
        </Button>
      </div>
      <div id="mkMarketList">
        {s.busy ? (
          <div className="mk-empty" role="status">
            Chargement des marchés…
          </div>
        ) : !rows.length ? (
          <div className="mk-empty">
            {query
              ? "Aucun marché ne correspond à la recherche."
              : "Commencez par créer une fiche, puis importez les pièces du marché."}
          </div>
        ) : (
          <div className="mk-table-wrap">
            <table className="mk-table">
              <thead>
                <tr>
                  <th>Marché / client</th>
                  <th>Référence</th>
                  <th>Plafond renseigné</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const c = m.ceilings[0];
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.title}</strong>
                        <small>{m.clientName}</small>
                      </td>
                      <td>{m.reference || "À préciser"}</td>
                      <td>
                        {c
                          ? money(c.amountMinor) + " " + c.basis
                          : "À préciser"}
                        {c && (
                          <small>
                            {c.scope === "annual"
                              ? "par période annuelle"
                              : c.scope === "contract"
                                ? "total du contrat"
                                : "période spécifique"}{" "}
                            ·{" "}
                            {c.status === "validated"
                              ? "vérifié"
                              : "à vérifier"}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="mk-status">{labels[m.status]}</span>
                      </td>
                      <td>
                        <Button className="mk-secondary" data-open={m.id}>
                          Ouvrir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
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
        <div id="marketMessage">
          {s.error ? (
            <div className="mk-message mk-error" role="alert">
              {s.error}
            </div>
          ) : s.notice ? (
            <div className="mk-message mk-success" role="status">
              {s.notice}
            </div>
          ) : null}
        </div>
        {m ? (
          <>
            <div className="mk-heading">
              <div>
                <Button className="mk-link" data-action="back">
                  ← Tous les marchés
                </Button>
                <h1>{m.title || "Nouveau marché"}</h1>
                <p>
                  {m.clientName || "Client à renseigner"}
                  {m.reference ? " · " + m.reference : ""}
                </p>
              </div>
              <span className="mk-status">{labels[m.status]}</span>
            </div>
            <div className="mk-editbar">
              <span id="mkSaveState">
                {s.dirty
                  ? "Modifications à enregistrer"
                  : m.version
                    ? "Version " + m.version + " enregistrée"
                    : "Nouvelle fiche"}
              </span>
              <div>
                <Button className="mk-secondary" data-action="export">
                  Exporter la fiche
                </Button>
                <Button className="mk-primary" data-action="save">
                  Enregistrer
                </Button>
              </div>
            </div>
            <nav className="mk-tabs" aria-label="Rubriques du marché">
              {Object.entries(tabs).map(([key, title]) => (
                <Button
                  key={key}
                  data-tab={key}
                  aria-current={s.tab === key ? "page" : "false"}
                >
                  {title}
                  {key === "issues" &&
                    m.issues.some((x) => x.status === "open") && (
                      <>
                        {" "}
                        <span>
                          {m.issues.filter((x) => x.status === "open").length}
                        </span>
                      </>
                    )}
                </Button>
              ))}
            </nav>
            <form id="mkForm" noValidate>
              <div className="mk-panel">
                <Content s={s} m={m} />
              </div>
            </form>
            <div className="mk-validation">
              <div>
                <strong>Validation du paramétrage</strong>
                <p>
                  {blockers.length
                    ? "À compléter : " + blockers.join(" ; ")
                    : "Les règles indispensables sont renseignées. Vérifiez les sources avant validation."}
                </p>
                <small>
                  Cette validation ne crée ni commande ni facture. La
                  consommation du marché sera suivie à partir des engagements
                  repris.
                </small>
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
