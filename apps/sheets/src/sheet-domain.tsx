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
export const statusOptions = [
  "Non commencé",
  "En cours",
  "Terminé",
  "En attente",
];
export const newId = (c = "id") =>
  `${c}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const clone = <T,>(c: T): T => structuredClone(c);
export function updateCell(
  sheet: Sheet,
  rowId: string,
  columnId: string,
  value: CellValue,
): Sheet {
  return {
    ...sheet,
    rows: sheet.rows.map((f) =>
      f.id === rowId ? { ...f, cells: { ...f.cells, [columnId]: value } } : f,
    ),
  };
}
export function rowDepth(row: SheetRow, rows: SheetRow[]) {
  let h = 0,
    o = row.parentId;
  const f = /* @__PURE__ */ new Set([row.id]);
  for (; o && !f.has(o); ) {
    f.add(o);
    const v = rows.find((p) => p.id === o);
    if (!v) break;
    (h++, (o = v.parentId));
  }
  return h;
}
export function descendantIds(rows: SheetRow[], selectedIds: Iterable<string>) {
  const h = new Set(selectedIds);
  let o = true;
  for (; o; ) {
    o = false;
    for (const f of rows)
      f.parentId &&
        h.has(f.parentId) &&
        !h.has(f.id) &&
        (h.add(f.id), (o = true));
  }
  return h;
}
export function deleteRows(sheet: Sheet, rowIds: string[]): Sheet {
  const h = descendantIds(sheet.rows, rowIds);
  return {
    ...sheet,
    rows: sheet.rows.filter((o) => !h.has(o.id)),
    comments: (sheet.comments || []).filter((o) => !h.has(o.rowId as string)),
  };
}
export function appendRow(
  sheet: Sheet,
  afterRowId: string | null = null,
  values: Partial<SheetRow> = {},
): Sheet {
  const o: SheetRow = {
      id: newId("row"),
      parentId: null,
      cells: Object.fromEntries(
        sheet.columns.map((p) => [p.id, p.type === "checkbox" ? false : ""]),
      ),
      ...values,
    },
    f = [...sheet.rows],
    v = f.find((p) => p.id === afterRowId);
  if (v) {
    o.parentId = values.parentId ?? v.parentId;
    const p = descendantIds(f, [v.id]);
    let R = f.findIndex((b) => b.id === v.id);
    (f.forEach((b, M) => {
      p.has(b.id) && (R = Math.max(R, M));
    }),
      f.splice(R + 1, 0, o));
  } else f.push(o);
  return { ...sheet, rows: f };
}
export function insertRow(
  sheet: Sheet,
  rowId: string,
  position: string = "after",
): Sheet {
  if (position !== "before") return appendRow(sheet, rowId);
  const o = sheet.rows.findIndex((R) => R.id === rowId);
  if (o < 0) return appendRow(sheet);
  const f = appendRow(sheet),
    v = f.rows.at(-1)!;
  v.parentId = sheet.rows[o].parentId;
  const p = [...sheet.rows];
  return (p.splice(o, 0, v), { ...sheet, rows: p });
}
export function selectionBounds(
  rows: SheetRow[],
  columns: Column[],
  anchor: CellAddress | null,
  focus: CellAddress | null = anchor,
) {
  if (!anchor || !focus) return null;
  const f = rows.findIndex((b) => b.id === anchor.rowId),
    v = rows.findIndex((b) => b.id === focus.rowId),
    p = columns.findIndex((b) => b.id === anchor.columnId),
    R = columns.findIndex((b) => b.id === focus.columnId);
  return [f, v, p, R].some((b) => b < 0)
    ? null
    : {
        top: Math.min(f, v),
        bottom: Math.max(f, v),
        left: Math.min(p, R),
        right: Math.max(p, R),
      };
}
export function navigateCell(
  rows: SheetRow[],
  columns: Column[],
  address: CellAddress | null,
  key: string,
  shift: boolean = false,
) {
  if (!rows.length || !columns.length) return null;
  let v = Math.max(
      0,
      rows.findIndex((R) => R.id === address?.rowId),
    ),
    p = Math.max(
      0,
      columns.findIndex((R) => R.id === address?.columnId),
    );
  return (
    key === "Tab"
      ? ((p += shift ? -1 : 1),
        p >= columns.length && ((p = 0), v++),
        p < 0 && ((p = columns.length - 1), v--))
      : key === "Enter" || key === "ArrowDown"
        ? (v += key === "Enter" && shift ? -1 : 1)
        : key === "ArrowUp"
          ? v--
          : key === "ArrowLeft"
            ? p--
            : key === "ArrowRight"
              ? p++
              : key === "Home"
                ? (p = 0)
                : key === "End" && (p = columns.length - 1),
    (v = Math.max(0, Math.min(rows.length - 1, v))),
    (p = Math.max(0, Math.min(columns.length - 1, p))),
    { rowId: rows[v].id, columnId: columns[p].id }
  );
}
export function parseClipboard(text: string) {
  if (text.length > 2e6) throw new Error("Le collage est limité à 2 Mo.");
  const m = [];
  let h = [],
    o = "",
    f = false;
  const v = text
    .replace(
      /\r\n/g,
      `
`,
    )
    .replace(
      /\r/g,
      `
`,
    );
  for (let p = 0; p < v.length; p++) {
    const R = v[p];
    R === '"' && (f || o === "")
      ? f && v[p + 1] === '"'
        ? ((o += '"'), p++)
        : (f = !f)
      : !f &&
          (R === "	" ||
            R ===
              `
`)
        ? (h.push(o),
          (o = ""),
          R ===
            `
` && (m.push(h), (h = [])))
        : (o += R);
  }
  if (f) throw new Error("Le texte copié contient des guillemets non fermés.");
  if (
    ((o !== "" || h.length || !m.length) && (h.push(o), m.push(h)),
    m.length > 1e3)
  )
    throw new Error("Le collage est limité à 1 000 lignes à la fois.");
  return m;
}
export function serializeClipboard(cells: CellValue[][]) {
  return cells.map((m) =>
    m
      .map((h) => {
        const o = String(h ?? "");
        return /[\t\n\r"]/.test(o) ? `"${o.replace(/"/g, '""')}"` : o;
      })
      .join("	"),
  ).join(`
`);
}
export function parseCellInput(text: string, column: Column) {
  if (text.startsWith("=")) return text;
  if (text === "") return column.type === "checkbox" ? false : "";
  if (column.type === "number") {
    const h = Number(
      text
        .replace(/[\s\u00a0\u202f]/g, "")
        .replace(",", ".")
        .replace(/%$/, ""),
    );
    if (!Number.isFinite(h))
      throw new Error(
        `\xAB ${text} \xBB n\u2019est pas un nombre valide pour ${column.title}.`,
      );
    return coerceCell(h, column);
  }
  if (column.type === "date") {
    const h = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim()),
      o = h
        ? `${h[3]}-${h[2].padStart(2, "0")}-${h[1].padStart(2, "0")}`
        : text.trim();
    if (dateSerial(o) === null)
      throw new Error(
        `\xAB ${text} \xBB n\u2019est pas une date valide pour ${column.title}.`,
      );
    return o;
  }
  if (column.type === "checkbox") {
    const h = text.toLocaleLowerCase("fr").trim();
    if (["true", "1", "oui", "vrai", "x", "✓"].includes(h)) return true;
    if (["false", "0", "non", "faux"].includes(h)) return false;
    throw new Error(
      `\xAB ${text} \xBB n\u2019est pas une case \xE0 cocher valide pour ${column.title}.`,
    );
  }
  return text;
}
export function pasteCells(
  sheet: Sheet,
  visibleIds: string[],
  anchor: CellAddress,
  cells: string[][],
): Sheet {
  if (!cells.length) return sheet;
  const f = visibleIds.indexOf(anchor.rowId),
    v = sheet.columns.findIndex((M) => M.id === anchor.columnId);
  if (f < 0 || v < 0)
    throw new Error("Sélectionnez une cellule avant de coller.");
  if (cells.length > 1e3)
    throw new Error("Le collage est limité à 1 000 lignes à la fois.");
  if (cells.some((M) => v + M.length > sheet.columns.length))
    throw new Error(
      "Le collage dépasse les colonnes de la feuille. Ajoutez les colonnes nécessaires.",
    );
  let p = sheet;
  const R = [...visibleIds];
  for (; R.length < f + cells.length; )
    ((p = appendRow(p)), R.push(p.rows.at(-1)!.id));
  const b = /* @__PURE__ */ new Map();
  return (
    cells.forEach((M, k) =>
      M.forEach((x, N) => {
        const V = R[f + k],
          G = sheet.columns[v + N];
        (b.has(V) || b.set(V, {}),
          (b.get(V)[G.id] = parseCellInput(String(x), G)));
      }),
    ),
    {
      ...p,
      rows: p.rows.map((M) =>
        b.has(M.id) ? { ...M, cells: { ...M.cells, ...b.get(M.id) } } : M,
      ),
    }
  );
}
export function clearCells(
  sheet: Sheet,
  rowIds: string[],
  columnIds: string[],
): Sheet {
  const o = new Set(rowIds),
    f = new Set(columnIds);
  return {
    ...sheet,
    rows: sheet.rows.map((v) =>
      o.has(v.id)
        ? {
            ...v,
            cells: {
              ...v.cells,
              ...Object.fromEntries(
                sheet.columns
                  .filter((p) => f.has(p.id))
                  .map((p) => [p.id, p.type === "checkbox" ? false : ""]),
              ),
            },
          }
        : v,
    ),
  };
}
export function indentRow(
  sheet: Sheet,
  rowId: string,
  outdent: boolean = false,
): Sheet {
  const o = sheet.rows.findIndex((p) => p.id === rowId),
    f = sheet.rows[o];
  if (!f) return sheet;
  let v;
  if (outdent) {
    if (!f.parentId) return sheet;
    v = sheet.rows.find((p) => p.id === f.parentId)?.parentId || null;
  } else {
    const R = sheet.rows
      .slice(0, o)
      .filter((b) => b.parentId === f.parentId)
      .at(-1);
    if (!R) return sheet;
    v = R.id;
  }
  return {
    ...sheet,
    rows: sheet.rows.map((p) => (p.id === rowId ? { ...p, parentId: v } : p)),
  };
}
export function visibleRows(
  sheet: Sheet,
  {
    query: queryProp = "",
    status: statusProp = "",
    collapsed: collapsedProp = new Set<string>(),
    sort: sortProp = null,
  }: RowFilter = {},
): SheetRow[] {
  const v = sheet.rows,
    p = queryProp.trim().toLocaleLowerCase("fr");
  let R = new Set(
    v
      .filter(
        (N) =>
          (!statusProp || N.cells.status === statusProp) &&
          (!p ||
            Object.values(N.cells).some((V) =>
              String(V).toLocaleLowerCase("fr").includes(p),
            )),
      )
      .map((N) => N.id),
  );
  if (p || statusProp)
    for (const N of v.filter((V) => R.has(V.id))) {
      let V = N.parentId;
      const G = /* @__PURE__ */ new Set<string>();
      for (; V && !G.has(V); )
        (G.add(V), R.add(V), (V = v.find((H) => H.id === V)?.parentId));
    }
  const b: SheetRow[] = [],
    M = /* @__PURE__ */ new Set<string>(),
    k = (N: SheetRow, V: SheetRow) => {
      if (!sortProp?.columnId) return 0;
      const G = cellValue(sheet, N.id, sortProp.columnId),
        H = cellValue(sheet, V.id, sortProp.columnId),
        q =
          typeof G == "number" && typeof H == "number"
            ? G - H
            : String(G ?? "").localeCompare(String(H ?? ""), "fr", {
                numeric: true,
              });
      return sortProp.direction === "desc" ? -q : q;
    },
    x = (N: string | null) => {
      const V = v
        .filter((G) => (G.parentId || null) === N && R.has(G.id))
        .sort(k);
      for (const G of V)
        M.has(G.id) ||
          (M.add(G.id),
          b.push(G),
          (!collapsedProp.has(G.id) || p || statusProp) && x(G.id));
    };
  x(null);
  for (const N of v)
    R.has(N.id) &&
      !M.has(N.id) &&
      (!N.parentId || !v.some((V) => V.id === N.parentId)) &&
      b.push(N);
  return b;
}
export function coerceCell(value: CellValue, column: Column): CellValue {
  if (typeof value == "string" && value.startsWith("=")) return value;
  if (column.type === "checkbox")
    return value === true || value === 1 || value === "true";
  if (column.type === "number") {
    if (value === "") return "";
    const h = Number(
      typeof value == "string"
        ? value
            .replace(/[\s\u00a0\u202f]/g, "")
            .replace(",", ".")
            .replace(/%$/, "")
        : value,
    );
    return Number.isFinite(h)
      ? column.id === "progress"
        ? Math.max(0, Math.min(100, h))
        : h
      : "";
  }
  if (column.type === "date") {
    const h = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value).trim()),
      o = h
        ? `${h[3]}-${h[2].padStart(2, "0")}-${h[1].padStart(2, "0")}`
        : value;
    return dateSerial(o) !== null ? o : "";
  }
  return value == null ? "" : String(value);
}
export function evaluateFormula(
  formula: string,
  resolveReference: (column: string, row: string) => CellValue,
): number {
  const h = formula.replace(/^=/, "").trim(),
    o: string[] = [];
  let f = 0;
  for (; f < h.length; ) {
    const x = h.slice(f),
      N =
        /^(\s+|\[[^\]]+\](?:@row|\d+)|\d+(?:\.\d+)?|[A-Za-z]+|[()+\-*/:,;])/.exec(
          x,
        );
    if (!N) throw new Error("Syntaxe non prise en charge");
    ((f += N[0].length), /^\s+$/.test(N[0]) || o.push(N[0]));
  }
  let v = 0;
  const p = (x: CellValue | CellValue[]) => {
      if (Array.isArray(x)) throw new Error("Plage hors fonction");
      const N = x === "" || x == null ? 0 : Number(x);
      if (!Number.isFinite(N)) throw new Error("Valeur non numérique");
      return N;
    },
    R = (x: string) => {
      const N = /^\[([^\]]+)\](@row|\d+)$/.exec(x);
      if (!N) throw new Error("Référence invalide");
      return { column: N[1], row: N[2] };
    };
  function b(): CellValue | CellValue[] {
    const x = o[v++];
    if (x === "+" || x === "-") return (x === "-" ? -1 : 1) * p(b());
    if (x === "(") {
      const N = M(0);
      if (o[v++] !== ")") throw new Error("Parenthèse manquante");
      return N;
    }
    if (/^\d/.test(x || "")) return Number(x);
    if (x?.startsWith("[")) {
      const N = R(x);
      if (o[v] === ":") {
        v++;
        const V = R(o[v++]);
        if (N.column !== V.column || N.row === "@row" || V.row === "@row")
          throw new Error("Plage invalide");
        const G = Number(N.row),
          H = Number(V.row);
        if (H < G || H - G > 1e4) throw new Error("Plage invalide");
        return Array.from({ length: H - G + 1 }, (q, J) =>
          resolveReference(N.column, String(G + J)),
        );
      }
      return resolveReference(N.column, N.row);
    }
    if (/^[A-Za-z]+$/.test(x || "")) {
      if (o[v++] !== "(") throw new Error("Fonction invalide");
      let N: (CellValue | CellValue[])[] = [];
      if (o[v] !== ")")
        do {
          if ((N.push(M(0)), o[v] !== "," && o[v] !== ";")) break;
          v++;
        } while (v < o.length);
      if (o[v++] !== ")") throw new Error("Parenthèse manquante");
      N = N.flat();
      const V = N.filter((H) => H !== "" && H != null);
      if (["COUNT", "NB"].includes(x.toUpperCase())) return V.length;
      const G = V.map(p);
      switch (x.toUpperCase()) {
        case "SUM":
        case "SOMME":
          return G.reduce((H, q) => H + q, 0);
        case "AVG":
        case "AVERAGE":
        case "MOYENNE":
          return G.length ? G.reduce((H, q) => H + q, 0) / G.length : 0;
        case "COUNT":
        case "NB":
          return V.length;
        case "MIN":
          return G.length ? Math.min(...G) : 0;
        case "MAX":
          return G.length ? Math.max(...G) : 0;
        default:
          throw new Error("Fonction non prise en charge");
      }
    }
    throw new Error("Expression invalide");
  }
  function M(x: number): CellValue | CellValue[] {
    let N = b();
    const V: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
    for (; (V[o[v]] || 0) > x; ) {
      const G = o[v++],
        H = M(V[G]),
        q = p(N),
        J = p(H);
      if (G === "/" && J === 0) throw new Error("Division par zéro");
      N = G === "+" ? q + J : G === "-" ? q - J : G === "*" ? q * J : q / J;
    }
    return N;
  }
  const k = M(0);
  if (v !== o.length || Array.isArray(k))
    throw new Error("Expression incomplète");
  return p(k);
}
export function cellValue(
  sheet: Sheet,
  rowId: string,
  columnId: string,
  visited: Set<string> = new Set<string>(),
): CellValue {
  const f = sheet.rows.find((b) => b.id === rowId),
    v = f?.cells[columnId] ?? "";
  if (typeof v != "string" || !v.startsWith("=")) return v;
  const p = `${rowId}/${columnId}`;
  if (visited.has(p)) return "#CIRCULAIRE";
  const R = new Set(visited);
  R.add(p);
  try {
    return evaluateFormula(v, (b, M) => {
      const k = sheet.columns.find(
          (V) =>
            V.title.toLocaleLowerCase("fr") === b.toLocaleLowerCase("fr") ||
            V.id === b,
        ),
        x = M === "@row" ? f : sheet.rows[Number(M) - 1];
      if (!k || !x) throw new Error("Référence introuvable");
      const N = cellValue(sheet, x.id, k.id, R);
      if (typeof N == "string" && N.startsWith("#")) throw new Error(N);
      return N;
    });
  } catch (b) {
    return (b as Error).message.includes("CIRCULAIRE")
      ? "#CIRCULAIRE"
      : "#ERREUR";
  }
}
export function dateSerial(value: unknown): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const m = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(m) && new Date(m).toISOString().slice(0, 10) === value
    ? Math.floor(m / 864e5)
    : null;
}
export const serialDate = (c: number) =>
  new Date(c * 864e5).toISOString().slice(0, 10);
export function timelineRange(rows: SheetRow[]) {
  const m = rows
      .flatMap((f) => [dateSerial(f.cells.start), dateSerial(f.cells.end)])
      .filter((f) => f !== null),
    h = Math.floor(Date.now() / 864e5),
    o = m.length ? Math.min(...m) - 3 : h - 7;
  return {
    start: o,
    end: Math.min(
      o + 1095,
      Math.max(o + 35, m.length ? Math.max(...m) + 7 : h + 35),
    ),
  };
}
export function ganttBar(row: SheetRow, startDay: number, dayWidth: number) {
  const o = dateSerial(row.cells.start),
    f = dateSerial(row.cells.end);
  return o === null || f === null || f < o
    ? null
    : {
        left: (o - startDay) * dayWidth,
        width: Math.max(dayWidth, (f - o + 1) * dayWidth),
        duration: f - o + 1,
      };
}
export function moveDates(
  row: Pick<SheetRow, "cells">,
  offset: number,
  edge: string = "move",
) {
  const o = dateSerial(row.cells.start),
    f = dateSerial(row.cells.end);
  return o === null || f === null || f < o || !Number.isInteger(offset)
    ? null
    : {
        start:
          edge === "end"
            ? o
            : edge === "start"
              ? Math.min(f, o + offset)
              : o + offset,
        end:
          edge === "start"
            ? f
            : edge === "end"
              ? Math.max(o, f + offset)
              : f + offset,
      };
}
export function dependencyLinks(
  sheet: Sheet,
  visible: SheetRow[],
  startDay: number,
  dayWidth: number,
) {
  const f = [];
  let v = 0;
  const p = new Map(visible.map((R, b) => [R.id, { row: R, index: b }]));
  for (const [R, b] of visible.entries()) {
    const M = String(b.cells.predecessors || "").trim();
    if (M)
      for (const k of new Set(
        M.split(/[,;]/)
          .map((x) => x.trim())
          .filter(Boolean),
      )) {
        if (!/^\d+$/.test(k)) {
          v++;
          continue;
        }
        const x = sheet.rows[Number(k) - 1];
        if (!x || x.id === b.id) {
          v++;
          continue;
        }
        const N = p.get(x.id);
        if (!N) continue;
        const V = ganttBar(N.row, startDay, dayWidth),
          G = ganttBar(b, startDay, dayWidth);
        !V ||
          !G ||
          f.push({
            fromId: x.id,
            toId: b.id,
            x1: V.left + V.width,
            y1: N.index * 36 + 18,
            x2: G.left,
            y2: R * 36 + 18,
          });
      }
  }
  return { links: f, unsupported: v };
}
