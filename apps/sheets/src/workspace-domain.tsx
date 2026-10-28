import {csvCell} from '../../../platform/csv-export';
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
export const uuid = () => crypto.randomUUID();
export const defaultColumns = () => [
  { id: "task", title: "Nom de la tâche", type: "text", width: 330 },
  {
    id: "status",
    title: "Statut",
    type: "select",
    width: 150,
    options: ["Non commencé", "En cours", "Terminé", "En attente"],
  },
  { id: "owner", title: "Responsable", type: "contact", width: 160 },
  { id: "start", title: "Début", type: "date", width: 120 },
  { id: "end", title: "Fin", type: "date", width: 120 },
  { id: "progress", title: "% terminé", type: "number", width: 110 },
  {
    id: "priority",
    title: "Priorité",
    type: "select",
    width: 120,
    options: ["Haute", "Normale", "Basse"],
  },
  { id: "budget", title: "Budget", type: "number", width: 120 },
  {
    id: "predecessors",
    title: "Prédécesseurs",
    type: "text",
    width: 130,
  },
];
export function createSheet(name: string, workspaceId: string): Sheet {
  return {
    id: uuid(),
    name: name,
    workspaceId: workspaceId,
    folderId: null,
    favorite: false,
    columns: defaultColumns(),
    rows: [],
    comments: [],
    forms: [],
    automations: [],
    lastView: "grid",
    createdAt: /* @__PURE__ */ new Date().toISOString(),
    updatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
}
export function parseCSV(text: string) {
  text = text.replace(/^\uFEFF/, "");
  const m = text.split(/\r?\n/, 1)[0],
    h = (m.match(/;/g) || []).length > (m.match(/,/g) || []).length ? ";" : ",",
    o: string[][] = [];
  let f: string[] = [],
    v = "",
    p = false;
  for (let R = 0; R < text.length; R++) {
    const b = text[R];
    b === '"'
      ? p && text[R + 1] === '"'
        ? ((v += '"'), R++)
        : p || !v
          ? (p = !p)
          : (v += b)
      : b === h && !p
        ? (f.push(v), (v = ""))
        : (b === "\r" ||
              b ===
                `
`) &&
            !p
          ? (b === "\r" &&
              text[R + 1] ===
                `
` &&
              R++,
            f.push(v),
            f.some((M) => M !== "") && o.push(f),
            (f = []),
            (v = ""))
          : (v += b);
  }
  if (p) throw new Error("Le CSV contient des guillemets non fermés.");
  return (f.push(v), f.some((R) => R !== "") && o.push(f), o);
}
export function importCSV(
  text: string,
  name: string,
  workspaceId: string,
): Sheet {
  const o = parseCSV(text);
  if (o.length < 1) throw new Error("Le fichier CSV est vide.");
  if (o.length > 20001) throw new Error("Maximum 20 000 lignes par import.");
  const f = o.shift()!;
  if (f.length > 100) throw new Error("Maximum 100 colonnes par import.");
  const v: Record<string, string> = {
      "nom de la tâche": "task",
      tâche: "task",
      task: "task",
      statut: "status",
      responsable: "owner",
      "attribué à": "owner",
      début: "start",
      "date de début": "start",
      fin: "end",
      "date de fin": "end",
      "% terminé": "progress",
      "% achevé": "progress",
      priorité: "priority",
      budget: "budget",
      "budget (€)": "budget",
      prédécesseurs: "predecessors",
    },
    p = /* @__PURE__ */ new Set<string>(),
    R = f.map((M, k) => {
      let x = v[M.toLowerCase().trim()] || `col-${k}`;
      return (
        p.has(x) && (x = `col-${k}`),
        p.add(x),
        {
          ...(defaultColumns().find((V) => V.id === x) || {
            type: "text",
            width: 180,
          }),
          id: x,
          title: M.trim() || `Colonne ${k + 1}`,
        }
      );
    });
  if (R.some((M) => M.title.length > 300))
    throw new Error("Un titre de colonne dépasse 300 caractères.");
  const b = createSheet(name.slice(0, 200), workspaceId);
  return (
    (b.columns = R),
    (b.rows = o.map((M, k) => ({
      id: uuid(),
      parentId: null,
      cells: Object.fromEntries(
        R.map((x, N) => {
          let V: string | number = M[N] || "";
          const G = (H: string) => {
            throw new Error(`Ligne ${k + 2}, ${x.title} : ${H}`);
          };
          if ((V.length > 1e5 && G("texte trop long."), V.startsWith("=")))
            return (V.length > 1e4 && G("formule trop longue."), [x.id, V]);
          if (x.type === "number" && ((V = V.trim()), V)) {
            const H = Number(V.replace(",", "."));
            ((!Number.isFinite(H) || Math.abs(H) > 1e15) &&
              G("nombre invalide."),
              x.id === "progress" &&
                (H < 0 || H > 100) &&
                G("pourcentage attendu entre 0 et 100."),
              (V = H));
          }
          if (x.type === "date" && V) {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(V as string)) {
              const [H, q, J] = (V as string).split("/");
              V = `${J}-${q}-${H}`;
            }
            (!/^\d{4}-\d{2}-\d{2}$/.test(V as string) ||
              !Number.isFinite(Date.parse(V as string)) ||
              new Date(V).toISOString().slice(0, 10) !== V) &&
              G("date attendue au format JJ/MM/AAAA ou AAAA-MM-JJ.");
          }
          return [x.id, V];
        }),
      ),
    }))),
    b
  );
}
export function exportCSV(sheet: Sheet, options?: unknown) {
  const h = csvCell;
  return (
    "﻿" +
    [
      sheet.columns.map((o) => h(o.title)).join(";"),
      ...sheet.rows.map((o) =>
        sheet.columns
          .map((f) => h(o.cells[f.id]))
          .join(";"),
      ),
    ].join(`\r
`)
  );
}
export function duplicateSheet(sheet: Sheet, options?: unknown): Sheet {
  const h = new Map(sheet.rows.map((f) => [f.id, uuid()])),
    o = structuredClone(sheet);
  return {
    ...o,
    id: uuid(),
    name: `${sheet.name} \u2014 copie`,
    favorite: false,
    rows: o.rows.map((f) => ({
      ...f,
      id: h.get(f.id)!,
      parentId: h.get(f.parentId as string) || null,
    })),
    comments: o.comments.map((f) => ({
      ...f,
      id: uuid(),
      rowId: h.get(f.rowId as string) || null,
    })),
    forms: o.forms.map((f) => ({ ...f, id: uuid() })),
    createdAt: /* @__PURE__ */ new Date().toISOString(),
    updatedAt: /* @__PURE__ */ new Date().toISOString(),
  };
}
