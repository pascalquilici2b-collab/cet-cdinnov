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
export const statusColors = {
  "Non commencé": "#c5cad6",
  "En cours": "#4c78d2",
  Terminé: "#40a788",
  "En attente": "#e9af4c",
};
export const defaultWidgets = [
  { id: "metric-total", type: "metric", metric: "total", title: "Tâches" },
  {
    id: "metric-progress",
    type: "metric",
    metric: "progress",
    title: "Avancement global",
  },
  {
    id: "metric-overdue",
    type: "metric",
    metric: "overdue",
    title: "Tâches en retard",
  },
  {
    id: "metric-budget",
    type: "metric",
    metric: "budget",
    title: "Budget total",
  },
  {
    id: "chart-status",
    type: "chart",
    chart: "status",
    title: "Répartition des statuts",
  },
  {
    id: "chart-progress",
    type: "chart",
    chart: "progress",
    title: "Avancement par feuille",
  },
  {
    id: "tasks-due",
    type: "tasks",
    mode: "due",
    title: "Prochaines échéances",
  },
  {
    id: "tasks-recent",
    type: "tasks",
    mode: "recent",
    title: "Dernières lignes",
  },
];
export function widgetId(prefix = "id") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
export function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
export function isValidDate(value: unknown): value is string {
  if (typeof value != "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [m, h, o] = value.split("-").map(Number),
    f = /* @__PURE__ */ new Date(0);
  return (
    f.setFullYear(m, h - 1, o),
    f.getFullYear() === m && f.getMonth() === h - 1 && f.getDate() === o
  );
}
export function localDay(date: Date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function numberValue(value: unknown) {
  if (typeof value == "number") return Number.isFinite(value) ? value : 0;
  const m = Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(m) ? m : 0;
}
export function summarizeSheets(
  sheets: Sheet[] = [],
  sheetIds: string[] = [],
  today: Date = new Date(),
): DashboardSummary {
  const o = sheets.filter((M) => sheetIds.includes(M.id)),
    f = localDay(today),
    v = o.flatMap((M) => {
      const k = new Set((M.rows || []).map((N) => N.parentId).filter(Boolean)),
        x =
          (M.columns || []).find((N) => N.id === "task") ||
          (M.columns || [])[0];
      return (M.rows || []).flatMap((N, V) => {
        if (k.has(N.id)) return [];
        const G = N.cells || {};
        if (
          !Object.values(G).some(
            (P) => P !== "" && P !== null && P !== void 0 && P !== false,
          )
        )
          return [];
        const H = normalizeStatus(G.status),
          q = Math.max(0, Math.min(100, numberValue(G.progress))),
          J =
            ["termine", "complete", "completed", "done"].includes(H) ||
            q >= 100,
          Z = J
            ? "Terminé"
            : H === "en cours"
              ? "En cours"
              : H === "en attente" || H === "bloque"
                ? "En attente"
                : H === "non commence" || !H
                  ? "Non commencé"
                  : String(G.status),
          F = isValidDate(G.end) ? G.end : null;
        return [
          {
            id: N.id,
            sheetId: M.id,
            sheetName: M.name,
            title: String(G[x?.id] || "Sans titre"),
            owner: String(G.owner || ""),
            status: Z,
            progress: J ? 100 : q,
            completed: J,
            budget: numberValue(G.budget),
            end: F,
            overdue: !!F && F < f && !J,
            index: V,
            updatedAt: N.updatedAt || M.updatedAt || M.createdAt || "",
          },
        ];
      });
    }),
    p = v.length,
    R = v.filter((M) => M.completed).length,
    b = Object.fromEntries(Object.keys(statusColors).map((M) => [M, 0]));
  for (const M of v) b[M.status] = (b[M.status] || 0) + 1;
  return {
    total: p,
    completed: R,
    overdue: v.filter((M) => M.overdue).length,
    progress: p ? Math.round(v.reduce((M, k) => M + k.progress, 0) / p) : 0,
    budget: v.reduce((M, k) => M + k.budget, 0),
    statusCounts: b,
    tasks: v,
    due: v
      .filter((M) => M.end && !M.completed)
      .sort((M, k) => M.end!.localeCompare(k.end!)),
    recent: [...v].sort(
      (M, k) => k.updatedAt.localeCompare(M.updatedAt) || k.index - M.index,
    ),
    sheets: o.map((M) => {
      const k = v.filter((x) => x.sheetId === M.id);
      return {
        id: M.id,
        name: M.name,
        total: k.length,
        completed: k.filter((x) => x.completed).length,
        progress: k.length
          ? Math.round(k.reduce((x, N) => x + N.progress, 0) / k.length)
          : 0,
      };
    }),
  };
}
export function formFields(sheet: Sheet, form: SheetForm): ResolvedField[] {
  const h = sheet?.columns || [];
  return (
    Array.isArray(form?.fields)
      ? form.fields
      : h.map((f) => ({
          columnId: f.id,
          label: f.title,
          required: f.id === "task",
        }))
  ).flatMap((f) => {
    const v = h.find((p) => p.id === f.columnId);
    return v ? [{ ...f, label: f.label || v.title, column: v }] : [];
  });
}
export function createForm(sheet: Sheet): SheetForm {
  return {
    id: widgetId("form"),
    title: sheet?.name ? `Nouveau : ${sheet.name}` : "Nouveau formulaire",
    description: "",
    active: true,
    successMessage: "Merci ! Votre réponse a bien été ajoutée à la feuille.",
    fields: (sheet?.columns || []).map((m) => ({
      columnId: m.id,
      label: m.title,
      required: m.id === "task",
      hidden: false,
    })),
  };
}
export function validateForm(
  sheet: Sheet,
  form: SheetForm,
  values: Record<string, CellValue> = {},
): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of formFields(sheet, form).filter((v) => !v.hidden)) {
    const v = values[f.columnId],
      p = v == null || (typeof v == "string" && v.trim() === "");
    if (f.required && (p || (f.column.type === "checkbox" && v !== true))) {
      o[f.columnId] =
        f.column.type === "checkbox"
          ? "Cette case doit être cochée."
          : "Ce champ est obligatoire.";
      continue;
    }
    p ||
      (f.column.type === "number" &&
        !Number.isFinite(Number(String(v).replace(",", "."))) &&
        (o[f.columnId] = "Saisissez un nombre valide."),
      f.column.type === "date" &&
        !isValidDate(v) &&
        (o[f.columnId] = "Saisissez une date valide."),
      f.column.type === "select" &&
        !(f.column.options || []).includes(v as string) &&
        (o[f.columnId] = "Sélectionnez une valeur de la liste."),
      f.columnId === "progress" &&
        (numberValue(v) < 0 || numberValue(v) > 100) &&
        (o[f.columnId] = "L’avancement doit être compris entre 0 et 100."));
  }
  return o;
}
export function formValues(
  sheet: Sheet,
  form: SheetForm,
  values: Record<string, CellValue> = {},
): Record<string, CellValue> {
  const o: Record<string, CellValue> = {};
  for (const f of formFields(sheet, form).filter((v) => !v.hidden)) {
    const v = values[f.columnId];
    f.column.type === "checkbox"
      ? (o[f.columnId] = v === true)
      : f.column.type === "number"
        ? (o[f.columnId] =
            v == null || String(v).trim() === ""
              ? ""
              : Number(String(v).replace(",", ".")))
        : (o[f.columnId] = String(v ?? "").trim());
  }
  return o;
}
export function readFormData(sheet: Sheet, form: SheetForm, data: FormData) {
  return Object.fromEntries(
    formFields(sheet, form)
      .filter((o) => !o.hidden)
      .map((o) => [
        o.columnId,
        o.column.type === "checkbox"
          ? data.has(o.columnId)
          : String(data.get(o.columnId) ?? ""),
      ]),
  );
}
export function reorderWidgets(
  widgets: Widget[],
  sourceId: string,
  targetId: string,
) {
  if (
    sourceId === targetId ||
    !widgets.some((v) => v.id === sourceId) ||
    !widgets.some((v) => v.id === targetId)
  )
    return widgets;
  const o = widgets.find((v) => v.id === sourceId)!,
    f = widgets.filter((v) => v.id !== sourceId);
  return (
    f.splice(
      f.findIndex((v) => v.id === targetId),
      0,
      o,
    ),
    f
  );
}
