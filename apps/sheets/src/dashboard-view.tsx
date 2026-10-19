import type {
  CellValue,
  Column,
  CellFormat,
  SheetRow,
  Sheet,
  SheetForm,
  Workspace,
  WorkspaceState,
  Widget,
  ResolvedField,
  CellAddress,
  RowFilter,
  DashboardSummary,
  DashboardTask,
} from "./contracts";
import * as React from "react";
import {
  ArrowDown as IconArrowDown,
  ArrowUp as IconArrowUp,
  ChartColumn as IconChartColumn,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  Clock3 as IconClock3,
  FileText as IconFileText,
  GripVertical as IconGripVertical,
  LayoutDashboard as IconLayoutDashboard,
  ListChecks as IconListChecks,
  Maximize2 as IconMaximize2,
  PenLine as IconPenLine,
  Plus as IconPlus,
  Settings2 as IconSettings2,
  Trash2 as IconTrash2,
  Type as IconType,
  X as IconX,
} from "lucide-react";
import {
  defaultWidgets,
  reorderWidgets,
  statusColors,
  summarizeSheets,
  widgetId,
} from "./dashboard-domain";
export const formatInteger = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});
export const formatEuro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const metricLabels = {
  total: "Tâches",
  completed: "Tâches terminées",
  progress: "Avancement global",
  overdue: "Tâches en retard",
  budget: "Budget total",
};
export const widgetLabels = {
  metric: "Indicateur",
  chart: "Graphique",
  tasks: "Liste de tâches",
  text: "Texte",
};
export const widgetIcons = {
  metric: IconLayoutDashboard,
  chart: IconChartColumn,
  tasks: IconListChecks,
  text: IconType,
};
// Custom widget colours remain user data. Adapt only their inherited text contrast.
function widgetStyle(background?: string): React.CSSProperties {
  if (!background) return { background: "var(--surface)" };
  const match = /^#([a-f\d]{6})$/i.exec(background);
  if (!match) return { background };
  const [r, g, b] = match[1].match(/../g)!.map(part => parseInt(part, 16) / 255);
  const linear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  const light = .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b) > .179;
  return { background, "--surface": background, "--ink": light ? "#1d1d1f" : "#f5f5f7", "--cdi-text-muted": light ? "#3d3d42" : "#e0e0e5" } as React.CSSProperties;
}
export function displayDashboardDate(c) {
  if (!c) return "—";
  const [m, h, o] = c.split("-");
  return `${o}/${h}/${m}`;
}
export function WidgetEmpty({
  children: childrenProp,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className={"iv-empty"}>
      <IconChartColumn size={30} strokeWidth={1.25} />
      <p>{childrenProp}</p>
    </div>
  );
}
export function EditableText({
  value: valueProp,
  onCommit: onCommitProp,
  ...h
}) {
  const [o, f] = React.useState(valueProp || "");
  React.useEffect(() => f(valueProp || ""), [valueProp]);
  const v = () => {
    const p = o.trim();
    p ? (f(p), p !== valueProp && onCommitProp(p)) : f(valueProp || "");
  };
  return (
    <input
      {...h}
      value={o}
      onChange={(p) =>
        f(
          (
            p.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        )
      }
      onBlur={v}
      onKeyDown={(p) => {
        (p.key === "Enter" && (p.preventDefault(), p.currentTarget.blur()),
          p.key === "Escape" && (f(valueProp || ""), p.stopPropagation()));
      }}
    />
  );
}
export function StatusChart({
  summary: summaryProp,
}: {
  summary: DashboardSummary;
}) {
  const m = Object.entries(summaryProp.statusCounts).filter(([, f]) => f > 0);
  let h = 0;
  const o = m
    .map(([f, v]) => {
      const p = h;
      return (
        (h += (v / summaryProp.total) * 100),
        `${statusColors[f] || "#9581c4"} ${p}% ${h}%`
      );
    })
    .join(",");
  return summaryProp.total ? (
    <div className={"iv-status-chart"}>
      <div
        className={"iv-donut"}
        role={"img"}
        aria-label={m.map(([f, v]) => `${f} : ${v}`).join(", ")}
        style={{ background: `conic-gradient(${o})` }}
      >
        <div>
          <strong>{formatInteger.format(summaryProp.total)}</strong>
          <span>{"tâches"}</span>
        </div>
      </div>
      <div className={"iv-legend"}>
        {m.map(([f, v]) => (
          <div key={f}>
            <span
              className={"iv-dot"}
              style={{ background: statusColors[f] || "#9581c4" }}
            />
            <span>{f}</span>
            <strong>{v}</strong>
            <small>
              {Math.round((v / summaryProp.total) * 100)}
              {" %"}
            </small>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <WidgetEmpty>{"Aucune tâche dans les feuilles sélectionnées."}</WidgetEmpty>
  );
}
export function ProgressChart({
  summary: summaryProp,
  onOpenSheet: onOpenSheetProp,
}: {
  summary: DashboardSummary;
  onOpenSheet: (id: string) => void;
}) {
  return summaryProp.sheets.length ? (
    <div className={"iv-progress-chart"}>
      {summaryProp.sheets.map((h) => (
        <div className={"iv-progress-item"} key={h.id}>
          <div>
            <button
              className={"iv-text-link"}
              onClick={() => onOpenSheetProp?.(h.id)}
            >
              {h.name}
            </button>
            <strong>
              {h.progress}
              {" %"}
            </strong>
          </div>
          <div
            className={"iv-progress-track"}
            role={"progressbar"}
            aria-label={`Avancement : ${h.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={h.progress}
          >
            <span style={{ width: `${h.progress}%` }} />
          </div>
          <small>
            {h.completed}
            {" sur "}
            {h.total}
            {" tâches terminées"}
          </small>
        </div>
      ))}
    </div>
  ) : (
    <WidgetEmpty>
      {"Ajoutez une feuille source pour afficher sa progression."}
    </WidgetEmpty>
  );
}
export function TaskList({
  tasks: tasksProp,
  onOpenSheet: onOpenSheetProp,
  mode: modeProp,
}: {
  tasks: DashboardTask[];
  onOpenSheet: (id: string) => void;
  mode: string;
}) {
  return tasksProp.length ? (
    <div className={"iv-task-table"}>
      <table>
        <thead>
          <tr>
            <th>{"Tâche / feuille"}</th>
            <th>{"Responsable"}</th>
            <th>{modeProp === "due" ? "Échéance" : "Statut"}</th>
          </tr>
        </thead>
        <tbody>
          {tasksProp.slice(0, 7).map((o) => (
            <tr key={`${o.sheetId}-${o.id}`}>
              <td>
                <button
                  onClick={() => onOpenSheetProp?.(o.sheetId)}
                  className={"iv-task-link"}
                >
                  {o.title}
                </button>
                <span className={"iv-task-source"}>{o.sheetName}</span>
              </td>
              <td>
                <span className={"iv-owner"}>{o.owner || "Non attribué"}</span>
              </td>
              <td>
                {modeProp === "due" ? (
                  <span className={`iv-date ${o.overdue ? "iv-late" : ""}`}>
                    {o.overdue && <IconClock3 size={12} />}
                    {displayDashboardDate(o.end)}
                  </span>
                ) : (
                  <span
                    className={"iv-status-pill"}
                    style={{
                      "--status-color": statusColors[o.status] || "#9581c4",
                    }}
                  >
                    {o.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasksProp.length > 7 && (
        <div className={"iv-table-note"}>
          {"7 tâches affichées sur "}
          {tasksProp.length}
          {". Ouvrez la feuille pour tout voir."}
        </div>
      )}
    </div>
  ) : (
    <WidgetEmpty>
      {modeProp === "due"
        ? "Aucune échéance à venir ou en retard."
        : "Aucune tâche à afficher."}
    </WidgetEmpty>
  );
}
export function DashboardView({
  dashboard: dashboardProp,
  sheets: sheetsProp = [],
  onChange: onChangeProp,
  onOpenSheet: onOpenSheetProp,
}) {
  const [f, v] = React.useState(false),
    [p, R] = React.useState(null),
    [b, M] = React.useState(null),
    [k, x] = React.useState(false),
    [N, V] = React.useState(false),
    [G, H] = React.useState(null),
    [q, J] = React.useState(null),
    Z = React.useRef(null),
    F = React.useMemo(
      () => summarizeSheets(sheetsProp, dashboardProp.sheetIds || []),
      [sheetsProp, dashboardProp.sheetIds],
    ),
    P =
      dashboardProp.widgets?.length || dashboardProp.widgetsConfigured
        ? dashboardProp.widgets || []
        : defaultWidgets,
    ee = P.find((C) => C.id === p),
    Se = (C) => onChangeProp?.({ ...dashboardProp, ...C }),
    re = (C) => Se({ widgets: C, widgetsConfigured: true }),
    ue = (C) => re(P.map((ne) => (ne.id === ee?.id ? { ...ne, ...C } : ne))),
    be = (C) => {
      (M(C), R(C));
    },
    ge = (C) => {
      (re(P.filter((ne) => ne.id !== C)),
        p === C && R(null),
        b === C && M(null));
    },
    we = (C, ne) => {
      const I = P.findIndex((et) => et.id === C),
        ve = I + ne;
      if (I < 0 || ve < 0 || ve >= P.length) return;
      const ye = [...P];
      (([ye[I], ye[ve]] = [ye[ve], ye[I]]), re(ye), M(C));
    },
    Te = () => {
      ((Z.current = null), H(null), J(null));
    },
    Oe = (C, ne) => {
      (C.preventDefault(), C.stopPropagation());
      const I = Z.current;
      if (f && I) {
        const ve = reorderWidgets(P, I, ne);
        (ve !== P && re(ve), M(I));
      }
      Te();
    },
    Ye = (C) => {
      const ne = {
        id: widgetId("widget"),
        type: C,
        title:
          C === "metric"
            ? "Tâches"
            : C === "chart"
              ? "Répartition des statuts"
              : C === "tasks"
                ? "Prochaines échéances"
                : "Notes du projet",
        metric: "total",
        chart: "status",
        mode: "due",
        content: "",
      };
      (re([...P, ne]), v(true), be(ne.id), x(false));
    },
    ke = () => {
      (v(false), R(null), M(null), x(false), Te());
    };
  return (
    React.useEffect(() => {
      (ke(), V(false));
    }, [dashboardProp.id]),
    React.useEffect(() => {
      const C = (ne) => {
        ne.key === "Escape" && (V(false), x(false));
      };
      return (
        document.addEventListener("keydown", C),
        () => document.removeEventListener("keydown", C)
      );
    }, []),
    (
      <section
        className={`iv-dashboard ${N ? "iv-presentation" : ""}`}
        aria-label={"Tableau de bord"}
      >
        <div className={"iv-dashboard-toolbar"}>
          <div className={"iv-toolbar-left"}>
            {f ? (
              <React.Fragment>
                <span className={"iv-edit-mode"}>{"Mode édition"}</span>
                <div className={"iv-toolbar-separator"} />
                <div className={"iv-add-wrapper"}>
                  <button
                    className={"iv-btn iv-quiet"}
                    onClick={() => x(!k)}
                    aria-expanded={k}
                  >
                    <IconPlus size={16} />
                    {"Ajouter un widget"}
                    <IconChevronDown size={13} />
                  </button>
                  {k && (
                    <div className={"iv-menu iv-menu-left"}>
                      {Object.entries(widgetLabels).map(([C, ne]) => {
                        const I = widgetIcons[C];
                        return (
                          <button onClick={() => Ye(C)} key={C}>
                            <I size={17} />
                            {ne}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  className={`iv-btn iv-quiet ${p === "sources" ? "iv-toolbar-active" : ""}`}
                  onClick={() => R(p === "sources" ? null : "sources")}
                >
                  <IconSettings2 size={15} />
                  {"Sources et paramètres"}
                </button>
              </React.Fragment>
            ) : (
              <button className={"iv-btn iv-quiet"} onClick={() => v(true)}>
                <IconPenLine size={15} />
                {"Modifier le tableau de bord"}
              </button>
            )}
          </div>
          <div className={"iv-toolbar-right"}>
            {f ? (
              <button className={"iv-btn iv-primary"} onClick={ke}>
                <IconCheck size={15} />
                {"Terminer"}
              </button>
            ) : (
              <button
                className={"iv-btn iv-quiet"}
                onClick={() => {
                  (V(!N), ke());
                }}
                title={
                  N ? "Quitter la présentation (Échap)" : "Mode Présentation"
                }
              >
                <IconMaximize2 size={15} />
                {N ? "Quitter la présentation" : "Mode Présentation"}
              </button>
            )}
          </div>
        </div>
        <div className={"iv-dashboard-body"}>
          <div className={"iv-dashboard-scroll"}>
            {f && (
              <div className={"iv-canvas-instruction"}>
                {
                  "Sélectionnez un widget. Double-cliquez pour le configurer ; utilisez la poignée pour le déplacer."
                }
              </div>
            )}
            <div className={"iv-dashboard-title-widget"}>
              <h1>{dashboardProp.name}</h1>
            </div>
            {!F.sheets.length && (
              <div className={"iv-source-alert"}>
                <IconFileText size={18} />
                <span>{"Aucune feuille source sélectionnée."}</span>
                {f && (
                  <button onClick={() => R("sources")}>
                    {"Choisir les sources"}
                    <IconChevronRight size={15} />
                  </button>
                )}
              </div>
            )}
            <div className={`iv-widget-grid ${f ? "iv-is-editing" : ""}`}>
              {P.map((C, ne) => (
                <article
                  role={"group"}
                  aria-label={`Widget : ${C.title || widgetLabels[C.type]}`}
                  tabIndex={f ? 0 : void 0}
                  style={widgetStyle(C.background)}
                  className={`iv-widget iv-widget-${C.type} ${f && b === C.id ? "iv-selected-widget" : ""} ${G === C.id ? "iv-widget-dragging" : ""} ${q === C.id ? "iv-widget-drop-target" : ""}`}
                  onClick={(I) => {
                    f &&
                      !(I.target as HTMLElement).closest(
                        "button, a, input, select, textarea",
                      ) &&
                      M(C.id);
                  }}
                  onDoubleClick={(I) => {
                    f &&
                      !(I.target as HTMLElement).closest(
                        "button, a, input, select, textarea",
                      ) &&
                      be(C.id);
                  }}
                  onKeyDown={(I) => {
                    f &&
                      I.target === I.currentTarget &&
                      I.key === "Enter" &&
                      (I.preventDefault(), be(C.id));
                  }}
                  onDragOver={(I) => {
                    f &&
                      Z.current &&
                      Z.current !== C.id &&
                      (I.preventDefault(),
                      (I.dataTransfer.dropEffect = "move"),
                      J(C.id));
                  }}
                  onDragLeave={(I) => {
                    I.currentTarget.contains(I.relatedTarget as Node) ||
                      J((ve) => (ve === C.id ? null : ve));
                  }}
                  onDrop={(I) => Oe(I, C.id)}
                  key={C.id}
                >
                  {f && (
                    <div className={"iv-widget-actions"}>
                      <button
                        className={"iv-widget-grip"}
                        draggable={true}
                        title={
                          "Glisser pour déplacer ; Alt + flèche haut ou bas au clavier"
                        }
                        aria-label={`D\xE9placer ${C.title}`}
                        onDragStart={(I) => {
                          ((Z.current = C.id),
                            H(C.id),
                            M(C.id),
                            (I.dataTransfer.effectAllowed = "move"),
                            I.dataTransfer.setData("text/plain", C.id));
                        }}
                        onDragEnd={Te}
                        onKeyDown={(I) => {
                          I.altKey &&
                            ["ArrowUp", "ArrowDown"].includes(I.key) &&
                            (I.preventDefault(),
                            we(C.id, I.key === "ArrowUp" ? -1 : 1));
                        }}
                      >
                        <IconGripVertical size={14} />
                      </button>
                      <button
                        title={"Configurer le widget"}
                        aria-label={`Configurer ${C.title}`}
                        onClick={() => be(C.id)}
                      >
                        <IconSettings2 size={14} />
                      </button>
                      <button
                        title={"Déplacer avant"}
                        aria-label={`D\xE9placer ${C.title} avant`}
                        disabled={ne === 0}
                        onClick={() => we(C.id, -1)}
                      >
                        <IconArrowUp size={14} />
                      </button>
                      <button
                        title={"Déplacer après"}
                        aria-label={`D\xE9placer ${C.title} apr\xE8s`}
                        disabled={ne === P.length - 1}
                        onClick={() => we(C.id, 1)}
                      >
                        <IconArrowDown size={14} />
                      </button>
                      <button
                        title={"Supprimer le widget"}
                        aria-label={`Supprimer ${C.title}`}
                        onClick={() => ge(C.id)}
                      >
                        <IconTrash2 size={14} />
                      </button>
                    </div>
                  )}
                  <h2 style={{ color: C.titleColor }}>
                    {C.title || widgetLabels[C.type]}
                  </h2>
                  {C.type === "metric" && (
                    <div
                      className={`iv-metric ${C.metric === "overdue" && F.overdue ? "iv-metric-warning" : ""}`}
                    >
                      <strong>
                        {C.metric === "budget"
                          ? formatEuro.format(F.budget)
                          : `${formatInteger.format(F[C.metric] || 0)}${C.metric === "progress" ? " %" : ""}`}
                      </strong>
                      <div>
                        {C.metric === "total"
                          ? `${F.completed} termin\xE9es \xB7 ${F.total - F.completed} ouvertes`
                          : C.metric === "completed"
                            ? `${F.total ? Math.round((F.completed / F.total) * 100) : 0} % des t\xE2ches`
                            : C.metric === "progress"
                              ? "Moyenne de l’avancement des tâches"
                              : C.metric === "overdue"
                                ? "Échéance passée et tâche ouverte"
                                : "Somme des budgets renseignés"}
                      </div>
                      {C.metric === "progress" && (
                        <div className={"iv-metric-track"}>
                          <span style={{ width: `${F.progress}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  {C.type === "chart" &&
                    (C.chart === "progress" ? (
                      <ProgressChart
                        summary={F}
                        onOpenSheet={onOpenSheetProp}
                      />
                    ) : (
                      <StatusChart summary={F} />
                    ))}
                  {C.type === "tasks" && (
                    <TaskList
                      tasks={C.mode === "recent" ? F.recent : F.due}
                      mode={C.mode}
                      onOpenSheet={onOpenSheetProp}
                    />
                  )}
                  {C.type === "text" && (
                    <div
                      className={"iv-text-widget"}
                      style={{
                        color: C.textColor,
                        textAlign: C.textAlign || "left",
                      }}
                    >
                      {C.content ||
                        "Ajoutez du texte dans les propriétés de ce widget."}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {!P.length && (
              <div className={"iv-dashboard-blank"}>
                <IconLayoutDashboard size={32} />
                <h2>{"Aucun widget"}</h2>
                <p>{"Ajoutez des indicateurs, des graphiques ou du texte."}</p>
                <button
                  className={"iv-btn"}
                  onClick={() => (f ? Ye("metric") : v(true))}
                >
                  <IconPlus size={15} />
                  {f ? "Ajouter un indicateur" : "Modifier le tableau de bord"}
                </button>
              </div>
            )}
            <div className={"iv-dashboard-status"}>
              <span>
                {F.sheets.length}
                {" feuille"}
                {F.sheets.length > 1 ? "s" : ""}
                {" source"}
                {F.sheets.length > 1 ? "s" : ""}
              </span>
              <span>
                {
                  "Calcul sur les tâches sans sous-tâches ; lignes vides exclues."
                }
              </span>
            </div>
          </div>
          {f && p && (
            <aside className={"iv-settings-panel"}>
              <div className={"iv-panel-title"}>
                <h2>
                  {p === "sources"
                    ? "Paramètres du tableau de bord"
                    : "Propriétés du widget"}
                </h2>
                <button
                  className={"iv-icon-button"}
                  onClick={() => R(null)}
                  aria-label={"Fermer les paramètres"}
                >
                  <IconX size={18} />
                </button>
              </div>
              {p === "sources" ? (
                <div className={"iv-settings-content"}>
                  <label className={"iv-label"}>
                    {"Nom du tableau de bord"}
                    <EditableText
                      value={dashboardProp.name}
                      onCommit={(C) => Se({ name: C })}
                      key={dashboardProp.id}
                    />
                  </label>
                  <h3>{"Feuilles sources"}</h3>
                  <p className={"iv-hint"}>
                    {
                      "Les widgets affichent les données des feuilles sélectionnées."
                    }
                  </p>
                  {sheetsProp.length ? (
                    sheetsProp.map((C) => (
                      <label className={"iv-source-option"} key={C.id}>
                        <input
                          type={"checkbox"}
                          checked={(dashboardProp.sheetIds || []).includes(
                            C.id,
                          )}
                          onChange={(ne) =>
                            Se({
                              sheetIds: ne.target.checked
                                ? [...(dashboardProp.sheetIds || []), C.id]
                                : (dashboardProp.sheetIds || []).filter(
                                    (I) => I !== C.id,
                                  ),
                            })
                          }
                        />
                        <IconFileText size={16} />
                        <span>
                          {C.name}
                          <small>
                            {C.rows?.length || 0}
                            {" lignes"}
                          </small>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className={"iv-hint"}>
                      {
                        "Créez d’abord une feuille dans votre espace de travail."
                      }
                    </p>
                  )}
                </div>
              ) : (
                ee && (
                  <div className={"iv-settings-content"}>
                    <label className={"iv-label"}>
                      {"Titre du widget"}
                      <input
                        value={ee.title || ""}
                        onChange={(C) =>
                          ue({
                            title: (
                              C.target as
                                | HTMLInputElement
                                | HTMLSelectElement
                                | HTMLTextAreaElement
                            ).value,
                          })
                        }
                      />
                    </label>
                    <div className={"iv-widget-type-label"}>
                      {widgetLabels[ee.type]}
                    </div>
                    {ee.type === "metric" && (
                      <label className={"iv-label"}>
                        {"Indicateur"}
                        <select
                          value={ee.metric || "total"}
                          onChange={(C) =>
                            ue({
                              metric: (
                                C.target as
                                  | HTMLInputElement
                                  | HTMLSelectElement
                                  | HTMLTextAreaElement
                              ).value,
                            })
                          }
                        >
                          {Object.entries(metricLabels).map(([C, ne]) => (
                            <option value={C} key={C}>
                              {ne}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {ee.type === "chart" && (
                      <label className={"iv-label"}>
                        {"Données du graphique"}
                        <select
                          value={ee.chart || "status"}
                          onChange={(C) =>
                            ue({
                              chart: (
                                C.target as
                                  | HTMLInputElement
                                  | HTMLSelectElement
                                  | HTMLTextAreaElement
                              ).value,
                            })
                          }
                        >
                          <option value={"status"}>
                            {"Répartition des statuts"}
                          </option>
                          <option value={"progress"}>
                            {"Avancement par feuille"}
                          </option>
                        </select>
                      </label>
                    )}
                    {ee.type === "tasks" && (
                      <label className={"iv-label"}>
                        {"Tâches à afficher"}
                        <select
                          value={ee.mode || "due"}
                          onChange={(C) =>
                            ue({
                              mode: (
                                C.target as
                                  | HTMLInputElement
                                  | HTMLSelectElement
                                  | HTMLTextAreaElement
                              ).value,
                            })
                          }
                        >
                          <option value={"due"}>
                            {"Prochaines échéances (retards inclus)"}
                          </option>
                          <option value={"recent"}>
                            {"Dernières lignes des feuilles"}
                          </option>
                        </select>
                      </label>
                    )}
                    {ee.type === "text" && (
                      <label className={"iv-label"}>
                        {"Contenu"}
                        <textarea
                          rows={8}
                          value={ee.content || ""}
                          placeholder={"Informations et prochaines étapes…"}
                          onChange={(C) =>
                            ue({
                              content: (
                                C.target as
                                  | HTMLInputElement
                                  | HTMLSelectElement
                                  | HTMLTextAreaElement
                              ).value,
                            })
                          }
                        />
                      </label>
                    )}
                    <div className={"iv-appearance-settings"}>
                      <h3>{"Apparence"}</h3>
                      <div className={"iv-color-options"}>
                        <label className={"iv-label"}>
                          {"Couleur du titre"}
                          <input
                            type={"color"}
                            value={ee.titleColor || "#3d4757"}
                            onChange={(C) =>
                              ue({
                                titleColor: (
                                  C.target as
                                    | HTMLInputElement
                                    | HTMLSelectElement
                                    | HTMLTextAreaElement
                                ).value,
                              })
                            }
                          />
                        </label>
                        <label className={"iv-label"}>
                          {"Arrière-plan"}
                          <input
                            type={"color"}
                            value={ee.background || "#ffffff"}
                            onChange={(C) =>
                              ue({
                                background: (
                                  C.target as
                                    | HTMLInputElement
                                    | HTMLSelectElement
                                    | HTMLTextAreaElement
                                ).value,
                              })
                            }
                          />
                        </label>
                      </div>
                      {ee.type === "text" && (
                        <React.Fragment>
                          <label className={"iv-label"}>
                            {"Couleur du texte"}
                            <input
                              type={"color"}
                              value={ee.textColor || "#566477"}
                              onChange={(C) =>
                                ue({
                                  textColor: (
                                    C.target as
                                      | HTMLInputElement
                                      | HTMLSelectElement
                                      | HTMLTextAreaElement
                                  ).value,
                                })
                              }
                            />
                          </label>
                          <label className={"iv-label"}>
                            {"Alignement"}
                            <select
                              value={ee.textAlign || "left"}
                              onChange={(C) =>
                                ue({
                                  textAlign: (
                                    C.target as
                                      | HTMLInputElement
                                      | HTMLSelectElement
                                      | HTMLTextAreaElement
                                  ).value,
                                })
                              }
                            >
                              <option value={"left"}>{"À gauche"}</option>
                              <option value={"center"}>{"Centré"}</option>
                              <option value={"right"}>{"À droite"}</option>
                            </select>
                          </label>
                        </React.Fragment>
                      )}
                    </div>
                    <button
                      className={"iv-btn iv-danger"}
                      onClick={() => ge(ee.id)}
                    >
                      <IconTrash2 size={15} />
                      {"Supprimer ce widget"}
                    </button>
                  </div>
                )
              )}
            </aside>
          )}
        </div>
      </section>
    )
  );
}
