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
import * as jsxRuntime from "react/jsx-runtime";
import {
  ArrowDown as IconArrowDown,
  ArrowDownUp as IconArrowDownUp,
  ArrowUp as IconArrowUp,
  Bold as IconBold,
  CalendarDays as IconCalendarDays,
  ChartNoAxesGantt as IconChartNoAxesGantt,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Columns3 as IconColumns3,
  Copy as IconCopy,
  Ellipsis as IconEllipsis,
  FileText as IconFileText,
  Filter as IconFilter,
  IndentDecrease as IconIndentDecrease,
  IndentIncrease as IconIndentIncrease,
  Italic as IconItalic,
  LayoutGrid as IconLayoutGrid,
  MessageSquare as IconMessageSquare,
  Paintbrush as IconPaintbrush,
  PanelRight as IconPanelRight,
  Plus as IconPlus,
  Redo2 as IconRedo2,
  Rows3 as IconRows3,
  Search as IconSearch,
  Table2 as IconTable2,
  Trash2 as IconTrash2,
  Underline as IconUnderline,
  Undo2 as IconUndo2,
  X as IconX,
} from "lucide-react";
import {
  appendRow,
  cellValue,
  clearCells,
  clone,
  coerceCell,
  dateSerial,
  deleteRows,
  dependencyLinks,
  descendantIds,
  ganttBar,
  indentRow,
  insertRow,
  moveDates,
  navigateCell,
  newId,
  parseClipboard,
  pasteCells,
  rowDepth,
  selectionBounds,
  serialDate,
  serializeClipboard,
  statusOptions,
  timelineRange,
  updateCell,
  visibleRows,
} from "./sheet-domain";
export const sheetViews = [
  { id: "grid", label: "Table", Icon: IconTable2 },
  { id: "cards", label: "Tableau", Icon: IconLayoutGrid },
  { id: "gantt", label: "Gantt", Icon: IconChartNoAxesGantt },
  { id: "calendar", label: "Agenda", Icon: IconCalendarDays },
];
export const columnTypeLabels = {
  text: "Texte / nombre",
  number: "Nombre",
  date: "Date",
  select: "Liste déroulante",
  checkbox: "Case à cocher",
  contact: "Contact",
};
export const statusClass = (c) =>
  c === "Terminé"
    ? "done"
    : c === "En cours"
      ? "active"
      : c === "En attente"
        ? "waiting"
        : "new";
export const displayDate = (c) => {
  const m = dateSerial(c);
  return m === null
    ? c
    : new Date(m * 864e5).toLocaleDateString("fr-FR", { timeZone: "UTC" });
};
export function ToolButton({
  title: titleProp,
  children: childrenProp,
  onClick: onClickProp,
  disabled: disabledProp,
  active: activeProp,
  className: classNameProp = "",
}: {
  title: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type={"button"}
      aria-label={titleProp}
      title={titleProp}
      disabled={disabledProp}
      onClick={onClickProp}
      className={`sv-tool ${activeProp ? "sv-active" : ""} ${classNameProp}`}
    >
      {childrenProp}
    </button>
  );
}
export function SheetModal({
  title: titleProp,
  onClose: onCloseProp,
  children: childrenProp,
  wide: wideProp = false,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  const f = React.useRef(null);
  return (
    React.useEffect(() => {
      const v = document.activeElement as HTMLElement;
      return (f.current?.focus(), () => v?.focus?.());
    }, []),
    (
      <div
        className={"sv-overlay"}
        onMouseDown={(v) => {
          v.target === v.currentTarget && onCloseProp();
        }}
      >
        <section
          className={`sv-modal ${wideProp ? "sv-wide" : ""}`}
          role={"dialog"}
          aria-modal={"true"}
          aria-label={titleProp}
          tabIndex={-1}
          ref={f}
          onKeyDown={(v) => {
            if ((v.key === "Escape" && onCloseProp(), v.key === "Tab")) {
              const p = [
                  ...(f.current as HTMLElement).querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
                  ),
                ],
                R = p[0],
                b = p.at(-1);
              v.shiftKey && (document.activeElement as HTMLElement) === R
                ? (v.preventDefault(), b?.focus())
                : !v.shiftKey &&
                  (document.activeElement as HTMLElement) === b &&
                  (v.preventDefault(), R?.focus());
            }
          }}
        >
          <header>
            <h2>{titleProp}</h2>
            <ToolButton title={"Fermer"} onClick={onCloseProp}>
              <IconX size={19} />
            </ToolButton>
          </header>
          {childrenProp}
        </section>
      </div>
    )
  );
}
export function CellContent({
  sheet: sheetProp,
  row: rowProp,
  column: columnProp,
  onSave: onSaveProp,
  onSelect: onSelectProp,
  line: lineProp,
  detail: detailProp = false,
}) {
  const R =
      rowProp.cells[columnProp.id] ??
      (columnProp.type === "checkbox" ? false : ""),
    b = cellValue(sheetProp, rowProp.id, columnProp.id),
    [M, k] = React.useState(false),
    [x, N] = React.useState(String(R)),
    V = React.useRef(null),
    G = React.useRef(false),
    H = React.useRef(false);
  (React.useEffect(() => {
    N(String(R));
  }, [R]),
    React.useEffect(() => {
      M &&
        ((H.current = false),
        (G.current = false),
        V.current?.focus(),
        V.current?.select?.());
    }, [M]));
  const q = () => {
      if (H.current) return;
      if (((H.current = true), k(false), G.current)) {
        G.current = false;
        return;
      }
      const Z = coerceCell(x, columnProp);
      Z !== R && onSaveProp(Z);
    },
    J = `${columnProp.title}, ligne ${lineProp}`;
  return columnProp.type === "checkbox" && !String(R).startsWith("=") ? (
    <div className={"sv-check-cell"}>
      <input
        type={"checkbox"}
        aria-label={J}
        checked={!!R}
        onFocus={onSelectProp}
        onChange={(Z) => onSaveProp(Z.target.checked)}
      />
    </div>
  ) : columnProp.type === "select" && !String(R).startsWith("=") ? (
    <div className={"sv-select-cell"}>
      <span className={`sv-status sv-status-${statusClass(R)}`}>
        {R || "—"}
      </span>
      <select
        aria-label={J}
        value={R}
        onFocus={onSelectProp}
        onChange={(Z) =>
          onSaveProp(
            (
              Z.target as
                | HTMLInputElement
                | HTMLSelectElement
                | HTMLTextAreaElement
            ).value,
          )
        }
      >
        <option value={""}>{"—"}</option>
        {[
          .../* @__PURE__ */ new Set([
            ...(columnProp.options || []),
            ...(R ? [R] : []),
          ]),
        ].map((Z) => (
          <option key={Z}>{Z}</option>
        ))}
      </select>
    </div>
  ) : M ? (
    <input
      ref={V}
      className={"sv-cell-editor"}
      aria-label={J}
      type={columnProp.type === "date" && !x.startsWith("=") ? "date" : "text"}
      inputMode={columnProp.type === "number" ? "decimal" : void 0}
      value={x}
      onInput={(Z) =>
        N(
          (
            Z.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        )
      }
      onChange={(Z) =>
        N(
          (
            Z.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        )
      }
      onBlur={q}
      onKeyDown={(Z) => {
        ((Z.key === "Enter" || Z.key === "Tab") && q(),
          Z.key === "Escape" &&
            ((G.current = true), N(String(R)), k(false), Z.stopPropagation()));
      }}
    />
  ) : (
    <button
      type={"button"}
      aria-label={`${J} : ${b === "" ? "vide" : b}`}
      className={`sv-cell-value ${columnProp.type === "number" ? "sv-number" : ""} ${String(b).startsWith("#") ? "sv-cell-error" : ""}`}
      title={String(R).startsWith("=") ? `${R} \u2192 ${b}` : String(b)}
      onClick={() => {
        (onSelectProp?.(), N(String(R)), k(true));
      }}
      onKeyDown={(Z) => {
        (Z.key === "Delete" || Z.key === "Backspace") &&
          (Z.preventDefault(), onSaveProp(""));
      }}
    >
      {columnProp.id === "progress" &&
      b !== "" &&
      Number.isFinite(Number(b)) ? (
        <span className={"sv-progress"}>
          <i style={{ width: `${Math.max(0, Math.min(100, Number(b)))}%` }} />
          <span>
            {b}
            {"%"}
          </span>
        </span>
      ) : columnProp.type === "date" ? (
        displayDate(b)
      ) : typeof b == "number" ? (
        b.toLocaleString("fr-FR", { maximumFractionDigits: 4 })
      ) : (
        String(b)
      )}
      {String(R).startsWith("=") && (
        <small className={"sv-formula-mark"}>{"ƒ"}</small>
      )}
    </button>
  );
}
export function CellEditor({
  sheet: sheetProp,
  row: rowProp,
  column: columnProp,
  line: lineProp,
  edit: editProp,
  onCommit: onCommitProp,
  onCancel: onCancelProp,
  onNavigate: onNavigateProp,
  onActivate: onActivateProp,
}) {
  const M = rowProp.cells[columnProp.id] ?? "",
    k = cellValue(sheetProp, rowProp.id, columnProp.id),
    x = `${columnProp.title}, ligne ${lineProp}`,
    [N, V] = React.useState(String(M)),
    [G, H] = React.useState(""),
    q = React.useRef(null),
    J = React.useRef(false);
  React.useEffect(() => {
    editProp &&
      ((J.current = false),
      H(""),
      V(editProp.seed ?? String(M)),
      requestAnimationFrame(() => {
        (q.current?.focus(), editProp.seed == null && q.current?.select?.());
      }));
  }, [editProp?.sequence]);
  const Z = (F = null, P = false) => {
    if (J.current) return;
    const ee = q.current?.value ?? N,
      Se = coerceCell(ee, columnProp);
    if (
      ee !== "" &&
      !ee.startsWith("=") &&
      Se === "" &&
      ["date", "number"].includes(columnProp.type)
    ) {
      (H(
        columnProp.type === "date"
          ? "Date invalide : utilisez JJ/MM/AAAA ou AAAA-MM-JJ."
          : "Saisissez un nombre valide.",
      ),
        onActivateProp(),
        requestAnimationFrame(() => q.current?.focus()));
      return;
    }
    ((J.current = true),
      onCommitProp(Se),
      F ? onNavigateProp(F, P) : onCancelProp(false));
  };
  if (editProp) {
    const F = {
      ref: q,
      className: "sv-cell-editor",
      value: N,
      "aria-label": x,
      "aria-invalid": !!G,
      onInput: (P) => {
        (V(
          (
            P.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        ),
          H(""));
      },
      onChange: (P) => {
        (V(
          (
            P.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        ),
          H(""));
      },
      onBlur: () => Z(),
      onKeyDown: (P) => {
        (P.key === "Escape" &&
          (P.preventDefault(),
          P.stopPropagation(),
          (J.current = true),
          onCancelProp(true)),
          (P.key === "Enter" || P.key === "Tab") &&
            (P.preventDefault(), P.stopPropagation(), Z(P.key, P.shiftKey)));
      },
    };
    return columnProp.type === "select" && !N.startsWith("=") ? (
      <select {...F}>
        <option value={""}>{"—"}</option>
        {[
          .../* @__PURE__ */ new Set([
            ...(columnProp.options || []),
            ...(N ? [N] : []),
          ]),
        ].map((P) => (
          <option key={P}>{P}</option>
        ))}
      </select>
    ) : (
      <React.Fragment>
        <input
          {...F}
          type={
            columnProp.type === "date" &&
            editProp.seed == null &&
            !N.startsWith("=")
              ? "date"
              : "text"
          }
          inputMode={columnProp.type === "number" ? "decimal" : void 0}
        />
        {G && (
          <span className={"sv-cell-validation"} role={"alert"}>
            {G}
            {" Échap pour annuler."}
          </span>
        )}
      </React.Fragment>
    );
  }
  return columnProp.type === "checkbox" && !String(M).startsWith("=") ? (
    <div className={"sv-check-cell"}>
      <button
        type={"button"}
        role={"checkbox"}
        aria-checked={!!M}
        aria-label={x}
        tabIndex={-1}
        className={`sv-grid-checkbox ${M ? "sv-is-checked" : ""}`}
        onClick={(F) => {
          (F.stopPropagation(), onActivateProp(), onCommitProp(!M));
        }}
      >
        {M && <IconCheck size={12} />}
      </button>
    </div>
  ) : (
    <div
      className={`sv-grid-cell-display ${columnProp.type === "number" ? "sv-number" : ""} ${String(k).startsWith("#") ? "sv-cell-error" : ""}`}
      title={String(M).startsWith("=") ? `${M} \u2192 ${k}` : String(k)}
    >
      {columnProp.type === "select" ? (
        <React.Fragment>
          <span className={`sv-status sv-status-${statusClass(M)}`}>
            {M || ""}
          </span>
          <IconChevronDown className={"sv-cell-dropdown"} size={12} />
        </React.Fragment>
      ) : columnProp.id === "progress" &&
        k !== "" &&
        Number.isFinite(Number(k)) ? (
        <span className={"sv-progress"}>
          <i style={{ width: `${Math.max(0, Math.min(100, Number(k)))}%` }} />
          <span>
            {k}
            {"%"}
          </span>
        </span>
      ) : (
        <span className={"sv-cell-text"}>
          {columnProp.type === "date"
            ? displayDate(k)
            : typeof k == "number"
              ? k.toLocaleString("fr-FR", { maximumFractionDigits: 4 })
              : String(k)}
        </span>
      )}
      {String(M).startsWith("=") && (
        <small className={"sv-formula-mark"}>{"ƒ"}</small>
      )}
    </div>
  );
}
export function ColumnDialog({
  sheet: sheetProp,
  onSave: onSaveProp,
  onClose: onCloseProp,
  onDelete: onDeleteProp,
  initial: initialProp,
  initialPosition: initialPositionProp,
}) {
  const [p, R] = React.useState(initialProp?.title || ""),
    [b, M] = React.useState(initialProp?.type || "text"),
    [k, x] = React.useState(
      (initialProp?.options || statusOptions).join(`
`),
    ),
    [N, V] = React.useState(""),
    [G, H] = React.useState(initialProp?.width || 180),
    [q, J] = React.useState(
      initialProp
        ? sheetProp.columns.findIndex((Z) => Z.id === initialProp.id)
        : (initialPositionProp ?? sheetProp.columns.length),
    );
  return (
    <SheetModal
      title={initialProp ? "Modifier la colonne" : "Insérer une colonne"}
      onClose={onCloseProp}
    >
      <form
        onSubmit={(Z) => {
          if ((Z.preventDefault(), !p.trim())) return V("Saisissez un titre.");
          if (
            sheetProp.columns.some(
              (F) =>
                F.title.toLocaleLowerCase("fr") ===
                  p.trim().toLocaleLowerCase("fr") && F.id !== initialProp?.id,
            )
          )
            return V("Ce titre de colonne existe déjà.");
          onSaveProp(
            {
              ...initialProp,
              id: initialProp?.id || newId("col"),
              title: p.trim(),
              type: b,
              width: Number(G),
              ...(b === "select"
                ? {
                    options: [
                      ...new Set(
                        k
                          .split(
                            `
`,
                          )
                          .map((F) => F.trim())
                          .filter(Boolean),
                      ),
                    ],
                  }
                : {}),
            },
            Number(q),
          );
        }}
      >
        <label>
          {"Nom de la colonne"}
          <input
            autoFocus={true}
            value={p}
            onChange={(Z) =>
              R(
                (
                  Z.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              )
            }
            required={true}
            placeholder={"Nom de la colonne"}
          />
        </label>
        <label>
          {"Type de colonne"}
          <select
            value={b}
            onChange={(Z) =>
              M(
                (
                  Z.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              )
            }
          >
            {Object.entries(columnTypeLabels).map(([Z, F]) => (
              <option value={Z} key={Z}>
                {F}
              </option>
            ))}
          </select>
        </label>
        {b === "select" && (
          <label>
            {"Valeurs (une par ligne)"}
            <textarea
              rows={5}
              value={k}
              onChange={(Z) =>
                x(
                  (
                    Z.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
            />
          </label>
        )}
        <div style={{ display: "flex", gap: 14 }}>
          <label style={{ flex: 1 }}>
            {"Largeur (px)"}
            <input
              type={"number"}
              min={"70"}
              max={"600"}
              value={G}
              onChange={(Z) =>
                H(
                  (
                    Z.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
              required={true}
            />
          </label>
          <label style={{ flex: 1 }}>
            {"Position"}
            <select
              value={q}
              onChange={(Z) =>
                J(
                  (
                    Z.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
            >
              {Array.from(
                {
                  length: sheetProp.columns.length + (initialProp ? 0 : 1),
                },
                (Z, F) => (
                  <option value={F} key={F}>
                    {F + 1}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        {initialProp && b !== initialProp.type && (
          <p className={"sv-hint"}>
            {
              "Les valeurs seront converties. Les valeurs incompatibles seront vidées. Cette modification peut être annulée."
            }
          </p>
        )}
        {N && (
          <p className={"sv-error"} role={"alert"}>
            {N}
          </p>
        )}
        <footer>
          {initialProp &&
            initialProp.id !==
              (
                sheetProp.columns.find((Z) => Z.id === "task") ||
                sheetProp.columns[0]
              )?.id && (
              <button
                type={"button"}
                className={"sv-button sv-column-delete"}
                onClick={() => onDeleteProp(initialProp)}
              >
                {"Supprimer"}
              </button>
            )}
          <button type={"button"} className={"sv-button"} onClick={onCloseProp}>
            {"Annuler"}
          </button>
          <button className={"sv-button sv-primary"} type={"submit"}>
            {initialProp ? "Enregistrer" : "Ajouter la colonne"}
          </button>
        </footer>
      </form>
    </SheetModal>
  );
}
export function SheetView({
  sheet: sheetProp,
  onChange: onChangeProp,
  onNotice: onNoticeProp = () => {},
  onOpenForms: onOpenFormsProp,
  saveStatus: saveStatusProp,
  saveError: saveErrorProp,
}: {
  sheet: Sheet;
  onChange: (sheet: Sheet) => void;
  onNotice?: (message: string) => void;
  onOpenForms?: () => void;
  saveStatus?: string;
  saveError?: string;
}) {
  const [p, R] = React.useState(/* @__PURE__ */ new Set<string>()),
    [b, M] = React.useState(/* @__PURE__ */ new Set<string>()),
    [k, x] = React.useState(""),
    [N, V] = React.useState(false),
    [G, H] = React.useState(""),
    [q, J] = React.useState(null),
    [Z, F] = React.useState(null),
    [P, ee] = React.useState(null),
    [Se, re] = React.useState(null),
    [ue, be] = React.useState(""),
    [ge, we] = React.useState(false),
    [Te, Oe] = React.useState("week"),
    [Ye, ke] = React.useState(() =>
      /* @__PURE__ */ new Date().toISOString().slice(0, 7),
    ),
    [C, ne] = React.useState(0),
    [I, ve] = React.useState("=1 + 2 * 3"),
    [ye, et] = React.useState(""),
    [Xe, Y] = React.useState(null),
    [g, B] = React.useState(null),
    [ie, te] = React.useState(null),
    [T, W] = React.useState(null),
    [ae, le] = React.useState(null),
    [me, Qe] = React.useState<Record<string, number>>({}),
    dt = React.useRef({ past: [], future: [] }),
    Ae = React.useRef(sheetProp),
    nt = React.useRef(null),
    Ze = React.useRef(null),
    De = React.useRef(false),
    zt = React.useRef(newId("gantt-arrow")),
    ol = React.useRef(null),
    Lt = React.useRef(false),
    dl = React.useRef(0),
    Ll = React.useRef(null),
    Et = React.useRef(null),
    Zt = React.useRef(null);
  ((Ae.current = sheetProp),
    React.useEffect(() => {
      (R(/* @__PURE__ */ new Set<string>()),
        M(/* @__PURE__ */ new Set<string>()),
        x(""),
        H(""),
        J(null),
        re(null),
        F(null),
        ee(null),
        we(false),
        B(null),
        te(null),
        W(null),
        le(null),
        (dt.current = { past: [], future: [] }),
        ne((r) => r + 1));
    }, [sheetProp.id]),
    React.useEffect(() => {
      const r = () => {
        Lt.current = false;
      };
      return (
        window.addEventListener("pointerup", r),
        window.addEventListener("blur", r),
        () => {
          (window.removeEventListener("pointerup", r),
            window.removeEventListener("blur", r));
        }
      );
    }, []),
    React.useEffect(() => {
      if (!Z && !ae) return;
      const r = (z) => {
        (z.target as HTMLElement).closest(".sv-menu-anchor,.sv-context-menu") ||
          (F(null), le(null));
      };
      return (
        document.addEventListener("pointerdown", r),
        () => document.removeEventListener("pointerdown", r)
      );
    }, [Z, ae]),
    React.useEffect(() => {
      if (ae)
        return (
          Ll.current?.querySelector("button")?.focus(),
          () => {
            requestAnimationFrame(() => {
              if ((document.activeElement as HTMLElement) === document.body) {
                const r = ol.current?.querySelector(
                  '[data-grid-cell][tabindex="0"]',
                );
                r ? r.focus() : Zt.current?.focus();
              }
            });
          }
        );
    }, [ae]));
  const Ke = (r) => {
      const z = Ae.current;
      if (r === z) return;
      const L = ["rows", "columns", "comments", "forms"].filter(
        (he) => JSON.stringify(z[he]) !== JSON.stringify(r[he]),
      );
      if (!L.length) return;
      (dt.current.past.push({ before: clone(z), after: clone(r), keys: L }),
        dt.current.past.length > 60 && dt.current.past.shift(),
        (dt.current.future = []));
      const $ = { ...r, updatedAt: /* @__PURE__ */ new Date().toISOString() };
      ((Ae.current = $), onChangeProp($), ne((he) => he + 1));
    },
    fn = (r, z) => {
      const L = {
        ...Ae.current,
        updatedAt: /* @__PURE__ */ new Date().toISOString(),
      };
      for (const $ of r.keys) L[$] = clone(r[z][$]);
      ((Ae.current = L), onChangeProp(L), ne(($) => $ + 1));
    },
    ca = () => {
      const r = dt.current.past.pop();
      r && (dt.current.future.push(r), fn(r, "before"));
    },
    Pt = () => {
      const r = dt.current.future.pop();
      r && (dt.current.past.push(r), fn(r, "after"));
    },
    el = (r, z, L) => Ke(updateCell(Ae.current, r, z, L)),
    tl = (r) => {
      (R(/* @__PURE__ */ new Set([r])), B(null), te(null));
    },
    Je = [...p].filter((r) => sheetProp.rows.some((z) => z.id === r)),
    ll = sheetProp.rows.filter((r) => p.has(r.id)),
    Ne = visibleRows(sheetProp, { query: k, status: G, collapsed: b, sort: q }),
    $l =
      Ne.map((r) => r.id).join("|") +
      "::" +
      sheetProp.columns.map((r) => r.id).join("|");
  React.useEffect(() => {
    g &&
      (!Ne.some((r) => r.id === g.rowId) ||
        !sheetProp.columns.some((r) => r.id === g.columnId)) &&
      (B(null), te(null), W(null));
  }, [$l]);
  const xe = selectionBounds(Ne, sheetProp.columns, ie, g),
    fl = (r) => {
      r &&
        requestAnimationFrame(() => {
          const z = [
            ...((ol.current as HTMLElement)?.querySelectorAll<HTMLElement>(
              "[data-grid-cell]",
            ) || []),
          ].find(
            (L) =>
              L.dataset.rowId === r.rowId && L.dataset.columnId === r.columnId,
          );
          (z?.focus({ preventScroll: true }),
            z?.scrollIntoView({ block: "nearest", inline: "nearest" }));
        });
    },
    Nl = (r, z = false, L = true) => {
      (B(r), (!z || !ie) && te(r));
      const $ = selectionBounds(Ne, sheetProp.columns, z && ie ? ie : r, r);
      (R(
        new Set(
          $ ? Ne.slice($.top, $.bottom + 1).map((he) => he.id) : [r.rowId],
        ),
      ),
        L && fl(r));
    },
    Tt = (r, z = false, L = g, $ = false) => {
      W(null);
      const he = navigateCell(Ne, sheetProp.columns, L, r, z);
      he && Nl(he, $);
    },
    j = (r, z = null) => {
      const L = sheetProp.columns.find((he) => he.id === r.columnId),
        $ = Ae.current.rows.find((he) => he.id === r.rowId);
      if (!(!L || !$)) {
        if (
          (Nl(r, false, false), le(null), L.type === "checkbox" && z !== "=")
        ) {
          (el($.id, L.id, !$.cells[L.id]), fl(r));
          return;
        }
        W({ ...r, seed: z, sequence: ++dl.current });
      }
    },
    K = () => {
      xe &&
        Ke(
          clearCells(
            Ae.current,
            Ne.slice(xe.top, xe.bottom + 1).map((r) => r.id),
            sheetProp.columns.slice(xe.left, xe.right + 1).map((r) => r.id),
          ),
        );
    },
    fe = (r, z) => {
      if (r.target === r.currentTarget) {
        if (r.key === "ContextMenu" || (r.shiftKey && r.key === "F10")) {
          r.preventDefault();
          const L = sheetProp.rows.find(($) => $.id === z.rowId);
          L && at(r, L);
          return;
        }
        if ((r.ctrlKey || r.metaKey) && ["Home", "End"].includes(r.key)) {
          (r.preventDefault(),
            Nl(
              {
                rowId: r.key === "Home" ? Ne[0].id : Ne.at(-1).id,
                columnId:
                  r.key === "Home"
                    ? sheetProp.columns[0].id
                    : sheetProp.columns.at(-1).id,
              },
              r.shiftKey,
            ));
          return;
        }
        if ((r.ctrlKey || r.metaKey) && r.key.toLowerCase() === "a") {
          if ((r.preventDefault(), Ne.length)) {
            const L = { rowId: Ne[0].id, columnId: sheetProp.columns[0].id },
              $ = {
                rowId: Ne.at(-1).id,
                columnId: sheetProp.columns.at(-1).id,
              };
            (te(L), B($), R(new Set(Ne.map((he) => he.id))), fl($));
          }
          return;
        }
        if (r.key === "F2" || r.key === "Enter") {
          (r.preventDefault(), j(z));
          return;
        }
        if (
          [
            "Tab",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
          ].includes(r.key)
        ) {
          (r.preventDefault(),
            Tt(r.key, r.shiftKey, z, r.shiftKey && r.key !== "Tab"));
          return;
        }
        if (r.key === "Delete" || r.key === "Backspace") {
          (r.preventDefault(), K());
          return;
        }
        if (r.key === "Escape") {
          (W(null), Nl(z));
          return;
        }
        r.key.length === 1 &&
          !r.ctrlKey &&
          !r.metaKey &&
          !r.altKey &&
          (r.preventDefault(), j(z, r.key));
      }
    },
    bt = (r) => {
      if (
        T ||
        !xe ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (r.target as HTMLElement).tagName,
        )
      )
        return;
      const z = Ne.slice(xe.top, xe.bottom + 1).map((L) =>
        sheetProp.columns
          .slice(xe.left, xe.right + 1)
          .map(($) => L.cells[$.id] ?? ""),
      );
      (r.preventDefault(),
        r.clipboardData.setData("text/plain", serializeClipboard(z)),
        r.type === "cut" && K());
    },
    jt = (r) => {
      if (
        !(
          T ||
          !g ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(
            (r.target as HTMLElement).tagName,
          )
        )
      ) {
        r.preventDefault();
        try {
          let z = parseClipboard(r.clipboardData.getData("text/plain"));
          const L = xe
            ? { rowId: Ne[xe.top].id, columnId: sheetProp.columns[xe.left].id }
            : g;
          xe &&
            z.length === 1 &&
            z[0].length === 1 &&
            (z = Array.from({ length: xe.bottom - xe.top + 1 }, () =>
              Array(xe.right - xe.left + 1).fill(z[0][0]),
            ));
          const $ = pasteCells(
            Ae.current,
            Ne.map((he) => he.id),
            L,
            z,
          );
          (Ke($), onNoticeProp(`${z.length} ligne(s) coll\xE9e(s).`));
        } catch (z) {
          onNoticeProp(z.message);
        }
      }
    },
    at = (r, z) => {
      (r.preventDefault(),
        r.stopPropagation(),
        p.has(z.id) || tl(z.id),
        F(null),
        le({
          kind: "row",
          rowId: z.id,
          x: Math.min(
            r.clientX || r.currentTarget.getBoundingClientRect().left,
            window.innerWidth - 252,
          ),
          y: Math.min(
            r.clientY || r.currentTarget.getBoundingClientRect().bottom,
            window.innerHeight - 310,
          ),
        }));
    },
    Rs = (r, z) => {
      (r.preventDefault(), r.stopPropagation());
      const L = r.currentTarget.getBoundingClientRect();
      (F(null),
        le({
          kind: "column",
          columnId: z.id,
          x: Math.min(
            r.type === "contextmenu" ? r.clientX : L.left,
            window.innerWidth - 270,
          ),
          y: Math.min(
            r.type === "contextmenu" ? r.clientY : L.bottom,
            window.innerHeight - 370,
          ),
        }));
    },
    ks = (r, z) => {
      const L = insertRow(Ae.current, r, z),
        $ = L.rows.find((he) => !Ae.current.rows.some((Ue) => Ue.id === he.id));
      if ((Ke(L), le(null), x(""), H(""), J(null), $)) {
        R(/* @__PURE__ */ new Set([$.id]));
        const he = { rowId: $.id, columnId: sheetProp.columns[0].id };
        (B(he), te(he), fl(he));
      }
    },
    Cl = sheetViews.some((r) => r.id === sheetProp.lastView)
      ? sheetProp.lastView
      : "grid",
    Bt = sheetViews.find((r) => r.id === Cl),
    Fl = (r) => {
      (onChangeProp({ ...sheetProp, lastView: r }), F(null));
    },
    Yt = () => {
      const r = appendRow(sheetProp, Je.at(-1));
      Ke(r);
      const z = r.rows.find((L) => !sheetProp.rows.some(($) => $.id === L.id));
      z && tl(z.id);
    },
    ra = (r: string, z?: string | boolean) =>
      Ke({
        ...sheetProp,
        rows: sheetProp.rows.map((L) =>
          p.has(L.id)
            ? { ...L, format: { ...L.format, [r]: z ?? !ll[0]?.format?.[r] } }
            : L,
        ),
      }),
    yc = (r) =>
      M((z) => {
        const L = new Set(z);
        return (L.has(r) ? L.delete(r) : L.add(r), L);
      }),
    ft = sheetProp.columns.find((r) => r.id === "task") || sheetProp.columns[0],
    nl = sheetProp.rows.find((r) => r.id === Se),
    Vt = timelineRange(Ne),
    Gt = Te === "day" ? 42 : Te === "week" ? 22 : 9,
    ml = Array.from({ length: Vt.end - Vt.start + 1 }, (r, z) => Vt.start + z),
    oa = Ne.filter((r) => {
      const z = dateSerial(r.cells.start),
        L = dateSerial(r.cells.end);
      return z !== null && L !== null && (z < Vt.start || L > Vt.end);
    }).length,
    da = Xe
      ? Ne.map((r) =>
          r.id === Xe.rowId
            ? {
                ...r,
                cells: {
                  ...r.cells,
                  start: serialDate(Xe.start),
                  end: serialDate(Xe.end),
                },
              }
            : r,
        )
      : Ne,
    On = dependencyLinks(sheetProp, da, Vt.start, Gt),
    fa =
      (
        sheetProp.columns.find((r) => r.id === "budget") ||
        sheetProp.columns.find((r) => r.type === "number") ||
        ft
      )?.title || "Colonne",
    Ri = (r, z, L) =>
      Ke({
        ...Ae.current,
        rows: Ae.current.rows.map(($) =>
          $.id === r
            ? {
                ...$,
                cells: { ...$.cells, start: serialDate(z), end: serialDate(L) },
              }
            : $,
        ),
      }),
    ma = (r, z, L = "move") => {
      r.button === 0 &&
        (r.preventDefault(),
        r.stopPropagation(),
        r.currentTarget.setPointerCapture(r.pointerId),
        (Ze.current = {
          rowId: z.id,
          start: dateSerial(z.cells.start),
          end: dateSerial(z.cells.end),
          originX: r.clientX,
          mode: L,
        }),
        (De.current = false));
    },
    _n = (r) => {
      const z = Ze.current;
      if (!z) return null;
      const L = Math.round((r.clientX - z.originX) / Gt);
      return {
        ...z,
        delta: L,
        ...moveDates(
          { cells: { start: serialDate(z.start), end: serialDate(z.end) } },
          L,
          z.mode,
        ),
      };
    },
    gc = (r) => {
      const z = _n(r);
      z && (Y(z), z.delta && (De.current = true));
    },
    Us = (r) => {
      const z = _n(r);
      ((Ze.current = null),
        Y(null),
        z &&
          (z.start !==
            dateSerial(
              Ae.current.rows.find((L) => L.id === z.rowId)?.cells.start,
            ) ||
            z.end !==
              dateSerial(
                Ae.current.rows.find((L) => L.id === z.rowId)?.cells.end,
              )) &&
          (Ri(z.rowId, z.start, z.end), (De.current = true)));
    },
    ha = [];
  ml.forEach((r) => {
    const z = serialDate(r).slice(0, 7);
    ha.at(-1)?.key === z
      ? ha.at(-1).count++
      : ha.push({ key: z, count: 1, day: r });
  });
  const qs = (r, z) => {
      (r.dataTransfer.setData("application/x-local-sheet-row", z.id),
        (r.dataTransfer.effectAllowed = "move"));
    },
    At =
      sheetProp.columns.find((r) => r.id === "status") ||
      sheetProp.columns.find((r) => r.type === "select"),
    Ba = At
      ? [
          .../* @__PURE__ */ new Set([
            ...(At.options || statusOptions),
            ...Ne.map((r) => r.cells[At.id] || "Sans statut"),
          ]),
        ]
      : ["Toutes les lignes"],
    Ya = /* @__PURE__ */ new Date(`${Ye}-01T12:00:00Z`),
    Hs = Math.floor(Ya.getTime() / 864e5),
    Bl = (Ya.getUTCDay() + 6) % 7,
    St = Array.from({ length: 42 }, (r, z) => Hs - Bl + z),
    Mt =
      sheetProp.columns.some((r) => r.id === "start" && r.type === "date") &&
      sheetProp.columns.some((r) => r.id === "end" && r.type === "date"),
    mn = (r) => {
      const z = /* @__PURE__ */ new Date(`${Ye}-01T12:00:00Z`);
      (z.setUTCMonth(z.getUTCMonth() + r), ke(z.toISOString().slice(0, 7)));
    },
    va = (r) => {
      (ee({ type: "column", column: r }), F(null), le(null));
    },
    hl = sheetProp.columns.find((r) => r.id === ae?.columnId),
    al = sheetProp.rows.find((r) => r.id === ae?.rowId),
    ki = (r, z) =>
      Ke({
        ...Ae.current,
        columns: Ae.current.columns.map((L) =>
          L.id === r
            ? { ...L, width: Math.max(70, Math.min(1200, Math.round(z))) }
            : L,
        ),
      }),
    pa = (r, z) => {
      (r.preventDefault(),
        r.stopPropagation(),
        r.currentTarget.setPointerCapture(r.pointerId),
        (Et.current = { columnId: z.id, x: r.clientX, width: z.width || 180 }),
        le(null));
    },
    Va = (r) => {
      const z = Et.current;
      z &&
        Qe({
          [z.columnId]: Math.max(70, Math.min(1200, z.width + r.clientX - z.x)),
        });
    },
    Ga = (r) => {
      const z = Et.current;
      z &&
        ((Et.current = null),
        Qe({}),
        ki(z.columnId, z.width + r.clientX - z.x));
    };
  return (
    <div
      className={"sv-root"}
      ref={Zt}
      tabIndex={-1}
      onKeyDown={(r) => {
        ((r.ctrlKey || r.metaKey) &&
          r.key.toLowerCase() === "z" &&
          !["INPUT", "TEXTAREA", "SELECT"].includes(
            (r.target as HTMLElement).tagName,
          ) &&
          (r.preventDefault(), r.shiftKey ? Pt() : ca()),
          r.key === "Escape" && (F(null), le(null)));
      }}
    >
      <div className={"sv-toolbar"}>
        <div className={"sv-menu-anchor"}>
          <button
            className={"sv-view-button"}
            aria-haspopup={"menu"}
            aria-expanded={Z === "views"}
            onClick={() => F(Z === "views" ? null : "views")}
          >
            {jsxRuntime.jsx(Bt.Icon, { size: 17 })}
            {Bt.label}
            <IconChevronDown size={14} />
          </button>
          {Z === "views" && (
            <div className={"sv-menu"} role={"menu"}>
              {sheetViews.map(({ id: r, label: z, Icon: L }) => (
                <button role={"menuitem"} onClick={() => Fl(r)} key={String(r)}>
                  <L size={17} />
                  {z}
                  {r === "grid" && (
                    <small className={"sv-view-new"}>{"Nouveau"}</small>
                  )}
                  {r === Cl && <IconCheck size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className={"sv-separator"} />
        <ToolButton
          title={"Annuler (Ctrl+Z)"}
          onClick={ca}
          disabled={!dt.current.past.length}
        >
          <IconUndo2 size={17} />
        </ToolButton>
        <ToolButton
          title={"Rétablir (Ctrl+Maj+Z)"}
          onClick={Pt}
          disabled={!dt.current.future.length}
        >
          <IconRedo2 size={17} />
        </ToolButton>
        <ToolButton
          title={"Rechercher dans la feuille"}
          onClick={() => {
            (V(!N), N && x(""));
          }}
          active={N}
        >
          <IconSearch size={17} />
        </ToolButton>
        <div className={"sv-menu-anchor"}>
          <ToolButton
            title={"Filtrer les lignes"}
            onClick={() => F(Z === "filter" ? null : "filter")}
            active={!!G}
          >
            <IconFilter size={17} />
            <span>
              {"Filtre"}
              {G ? " •" : ""}
            </span>
            <IconChevronDown size={12} />
          </ToolButton>
          {Z === "filter" && (
            <div className={"sv-menu sv-filter-menu"}>
              <strong>{"Afficher les lignes"}</strong>
              <label>
                {"Statut"}
                <select
                  aria-label={"Filtrer par statut"}
                  value={G}
                  onChange={(r) =>
                    H(
                      (
                        r.target as
                          | HTMLInputElement
                          | HTMLSelectElement
                          | HTMLTextAreaElement
                      ).value,
                    )
                  }
                >
                  <option value={""}>{"Tous les statuts"}</option>
                  {(
                    sheetProp.columns.find((r) => r.id === "status")?.options ||
                    statusOptions
                  ).map((r) => (
                    <option key={String(r)}>{r}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  (H(""), x(""), F(null));
                }}
              >
                {"Effacer les filtres"}
              </button>
            </div>
          )}
        </div>
        <div className={"sv-menu-anchor"}>
          <ToolButton
            title={"Trier les lignes"}
            onClick={() => F(Z === "sort" ? null : "sort")}
            active={!!q}
          >
            <IconArrowDownUp size={17} />
            <span>{"Trier"}</span>
          </ToolButton>
          {Z === "sort" && (
            <div className={"sv-menu sv-filter-menu"}>
              <strong>{"Trier les lignes"}</strong>
              <label>
                {"Colonne"}
                <select
                  aria-label={"Colonne de tri"}
                  value={q?.columnId || ""}
                  onChange={(r) =>
                    J(
                      (
                        r.target as
                          | HTMLInputElement
                          | HTMLSelectElement
                          | HTMLTextAreaElement
                      ).value
                        ? {
                            columnId: (
                              r.target as
                                | HTMLInputElement
                                | HTMLSelectElement
                                | HTMLTextAreaElement
                            ).value,
                            direction: q?.direction || "asc",
                          }
                        : null,
                    )
                  }
                >
                  <option value={""}>{"Ordre de la feuille"}</option>
                  {sheetProp.columns.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  J(
                    q
                      ? {
                          ...q,
                          direction: q.direction === "asc" ? "desc" : "asc",
                        }
                      : null,
                  )
                }
                disabled={!q}
              >
                {q?.direction === "desc" ? (
                  <IconArrowDown size={16} />
                ) : (
                  <IconArrowUp size={16} />
                )}{" "}
                {q?.direction === "desc" ? "Décroissant" : "Croissant"}
              </button>
              <small>{"Les groupes de lignes restent ensemble."}</small>
            </div>
          )}
        </div>
        <span className={"sv-separator"} />
        <ToolButton
          title={"Augmenter le retrait de la ligne"}
          disabled={Je.length !== 1 || !!q}
          onClick={() => Ke(indentRow(sheetProp, Je[0]))}
        >
          <IconIndentIncrease size={18} />
        </ToolButton>
        <ToolButton
          title={"Diminuer le retrait de la ligne"}
          disabled={Je.length !== 1 || !ll[0]?.parentId || !!q}
          onClick={() => Ke(indentRow(sheetProp, Je[0], true))}
        >
          <IconIndentDecrease size={18} />
        </ToolButton>
        <div className={"sv-menu-anchor"}>
          <ToolButton
            title={"Mettre en forme"}
            onClick={() => F(Z === "format" ? null : "format")}
            active={Z === "format"}
          >
            <IconPaintbrush size={17} />
            <span>{"Mettre en forme"}</span>
            <IconChevronDown size={12} />
          </ToolButton>
          {Z === "format" && (
            <div className={"sv-menu sv-format-popover"}>
              <strong>{"Format des lignes sélectionnées"}</strong>
              <div className={"sv-format-controls"}>
                <span className={"sv-font-label"}>
                  {"Inter "}
                  <span>{"13"}</span>
                </span>
                <span className={"sv-separator"} />
                <ToolButton
                  title={"Gras"}
                  disabled={!Je.length}
                  active={ll[0]?.format?.bold}
                  onClick={() => ra("bold")}
                >
                  <IconBold size={16} />
                </ToolButton>
                <ToolButton
                  title={"Italique"}
                  disabled={!Je.length}
                  active={ll[0]?.format?.italic}
                  onClick={() => ra("italic")}
                >
                  <IconItalic size={16} />
                </ToolButton>
                <ToolButton
                  title={"Souligner"}
                  disabled={!Je.length}
                  active={ll[0]?.format?.underline}
                  onClick={() => ra("underline")}
                >
                  <IconUnderline size={16} />
                </ToolButton>
                <label
                  className={`sv-color ${Je.length ? "" : "sv-disabled"}`}
                  title={"Couleur du texte"}
                >
                  <span
                    style={{
                      borderColor: ll[0]?.format?.color || "#253047",
                    }}
                  >
                    {"A"}
                  </span>
                  <input
                    type={"color"}
                    aria-label={"Couleur du texte"}
                    disabled={!Je.length}
                    value={ll[0]?.format?.color || "#253047"}
                    onChange={(r) =>
                      ra(
                        "color",
                        (
                          r.target as
                            | HTMLInputElement
                            | HTMLSelectElement
                            | HTMLTextAreaElement
                        ).value,
                      )
                    }
                  />
                </label>
                <label
                  className={`sv-color ${Je.length ? "" : "sv-disabled"}`}
                  title={"Couleur de fond"}
                >
                  <span
                    className={"sv-color-swatch"}
                    style={{
                      background: ll[0]?.format?.background || "#fff3b0",
                    }}
                  >
                    {"▰"}
                  </span>
                  <input
                    type={"color"}
                    aria-label={"Couleur de fond"}
                    disabled={!Je.length}
                    value={ll[0]?.format?.background || "#ffffff"}
                    onChange={(r) =>
                      ra(
                        "background",
                        (
                          r.target as
                            | HTMLInputElement
                            | HTMLSelectElement
                            | HTMLTextAreaElement
                        ).value,
                      )
                    }
                  />
                </label>
              </div>
              <button
                disabled={!Je.length}
                onClick={() => {
                  (Ke({
                    ...sheetProp,
                    rows: sheetProp.rows.map((r) =>
                      p.has(r.id) ? { ...r, format: {} } : r,
                    ),
                  }),
                    F(null));
                }}
              >
                {"Effacer la mise en forme"}
              </button>
            </div>
          )}
        </div>
        <ToolButton
          title={"Insérer une formule"}
          disabled={!Je.length}
          onClick={() => {
            (et(
              sheetProp.columns.find((r) => r.type === "number")?.id ||
                ft?.id ||
                "",
            ),
              ee({ type: "formula" }));
          }}
        >
          <b className={"sv-fx"}>{"ƒx"}</b>
          <span>{"Formules"}</span>
        </ToolButton>
        <div className={"sv-menu-anchor"}>
          <ToolButton
            title={"Insérer ou supprimer"}
            onClick={() => F(Z === "insert" ? null : "insert")}
          >
            <IconPlus size={18} />
            <IconChevronDown size={12} />
          </ToolButton>
          {Z === "insert" && (
            <div className={"sv-menu"}>
              <button
                onClick={() => {
                  (Yt(), F(null));
                }}
              >
                <IconRows3 size={16} />
                {" Ajouter une ligne"}
              </button>
              <button onClick={() => va(null)}>
                <IconColumns3 size={16} />
                {" Insérer une colonne"}
              </button>
              <button
                disabled={!Je.length}
                onClick={() => {
                  (ee({ type: "deleteRows" }), F(null));
                }}
              >
                <IconTrash2 size={16} />
                {" Supprimer les lignes"}
              </button>
            </div>
          )}
        </div>
        <span className={"sv-toolbar-spacer"} />
        <ToolButton
          title={"Formulaires"}
          onClick={onOpenFormsProp}
          disabled={!onOpenFormsProp}
        >
          <IconFileText size={17} />
          <span>{"Formulaires"}</span>
        </ToolButton>
        <ToolButton
          title={"Récapitulatif de la feuille"}
          active={ge}
          onClick={() => {
            (we(!ge), re(null));
          }}
        >
          <IconPanelRight size={18} />
        </ToolButton>
      </div>
      {(N || G || q) && (
        <div className={"sv-query-bar"}>
          {N && (
            <label className={"sv-search"}>
              <IconSearch size={16} />
              <input
                autoFocus={true}
                placeholder={"Rechercher dans cette feuille"}
                aria-label={"Rechercher dans cette feuille"}
                value={k}
                onChange={(r) =>
                  x(
                    (
                      r.target as
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement
                    ).value,
                  )
                }
              />
              {k && (
                <button
                  aria-label={"Effacer la recherche"}
                  onClick={() => x("")}
                >
                  <IconX size={14} />
                </button>
              )}
            </label>
          )}
          {G && (
            <button className={"sv-chip"} onClick={() => H("")}>
              {"Statut : "}
              {G}
              <IconX size={13} />
            </button>
          )}
          {q && (
            <button className={"sv-chip"} onClick={() => J(null)}>
              {"Tri : "}
              {sheetProp.columns.find((r) => r.id === q.columnId)?.title}{" "}
              {q.direction === "asc" ? "↑" : "↓"}
              <IconX size={13} />
            </button>
          )}
          <span>
            {Ne.length}
            {" ligne"}
            {Ne.length > 1 ? "s" : ""}
            {" affichée"}
            {Ne.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
      <div className={"sv-content"}>
        <div className={"sv-main"}>
          {Cl === "grid" && (
            <div
              className={"sv-grid-scroll"}
              ref={ol}
              onCopy={bt}
              onCut={bt}
              onPaste={jt}
            >
              <table
                className={"sv-grid"}
                role={"grid"}
                aria-label={`Feuille ${sheetProp.name}`}
                aria-rowcount={Ne.length + 1}
                aria-colcount={sheetProp.columns.length + 2}
              >
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 30 }} />
                  {sheetProp.columns.map((r) => (
                    <col
                      style={{
                        width:
                          me[r.id] ?? r.width ?? (r.id === ft?.id ? 310 : 170),
                      }}
                      key={r.id}
                    />
                  ))}
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={"sv-row-number"}>
                      <input
                        type={"checkbox"}
                        aria-label={"Sélectionner toutes les lignes"}
                        checked={Ne.length > 0 && Ne.every((r) => p.has(r.id))}
                        onChange={(r) => {
                          (B(null),
                            te(null),
                            R(
                              r.target.checked
                                ? new Set(Ne.map((z) => z.id))
                                : /* @__PURE__ */ new Set<string>(),
                            ));
                        }}
                      />
                    </th>
                    <th className={"sv-row-detail-head"}>
                      <IconMessageSquare size={13} />
                    </th>
                    {sheetProp.columns.map((r) => (
                      <th onContextMenu={(z) => Rs(z, r)} key={r.id}>
                        <button
                          className={"sv-col-button"}
                          onClick={(z) => Rs(z, r)}
                          onDoubleClick={() => va(r)}
                          title={`Options de la colonne ${r.title}`}
                          aria-haspopup={"menu"}
                        >
                          <span className={"sv-col-type"}>
                            {r.type === "date" ? (
                              <IconCalendarDays size={13} />
                            ) : r.type === "checkbox" ? (
                              <IconCheck size={13} />
                            ) : r.type === "number" ? (
                              "#"
                            ) : r.type === "select" ? (
                              <IconChevronDown size={13} />
                            ) : (
                              ""
                            )}
                          </span>
                          <span>{r.title}</span>
                          <IconChevronDown size={12} />
                        </button>
                        <span
                          role={"separator"}
                          aria-orientation={"vertical"}
                          aria-label={`Redimensionner la colonne ${r.title}`}
                          tabIndex={0}
                          className={"sv-column-resizer"}
                          onPointerDown={(z) => pa(z, r)}
                          onPointerMove={Va}
                          onPointerUp={Ga}
                          onPointerCancel={() => {
                            ((Et.current = null), Qe({}));
                          }}
                          onKeyDown={(z) => {
                            (z.key === "ArrowLeft" || z.key === "ArrowRight") &&
                              (z.preventDefault(),
                              ki(
                                r.id,
                                (r.width || 180) +
                                  (z.key === "ArrowLeft" ? -10 : 10),
                              ));
                          }}
                        />
                      </th>
                    ))}
                    <th>
                      <ToolButton
                        title={"Ajouter une colonne"}
                        onClick={() => va(null)}
                      >
                        <IconPlus size={16} />
                      </ToolButton>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Ne.map((r, z) => {
                    const L =
                        sheetProp.rows.findIndex((Ue) => Ue.id === r.id) + 1,
                      $ = sheetProp.rows.some((Ue) => Ue.parentId === r.id),
                      he = rowDepth(r, sheetProp.rows);
                    return (
                      <tr
                        className={p.has(r.id) && !g ? "sv-selected" : ""}
                        onContextMenu={(Ue) => at(Ue, r)}
                        style={{
                          backgroundColor: r.format?.background,
                          color: r.format?.color,
                          fontWeight: r.format?.bold ? "bold" : void 0,
                          fontStyle: r.format?.italic ? "italic" : void 0,
                          textDecoration: r.format?.underline
                            ? "underline"
                            : void 0,
                        }}
                        key={r.id}
                      >
                        <td
                          className={`sv-row-number ${p.has(r.id) ? "sv-active-row" : ""}`}
                        >
                          <span>{L}</span>
                          <input
                            type={"checkbox"}
                            aria-label={`S\xE9lectionner la ligne ${L}`}
                            checked={p.has(r.id)}
                            onChange={(Ue) => {
                              (B(null),
                                te(null),
                                R((Yl) => {
                                  const Kt = new Set(Yl);
                                  return (
                                    Ue.target.checked
                                      ? Kt.add(r.id)
                                      : Kt.delete(r.id),
                                    Kt
                                  );
                                }));
                            }}
                          />
                        </td>
                        <td className={"sv-row-detail"}>
                          <button
                            title={"Options de la ligne"}
                            aria-label={`Options de la ligne ${L}`}
                            onClick={(Ue) => at(Ue, r)}
                            aria-haspopup={"menu"}
                          >
                            {(sheetProp.comments || []).some(
                              (Ue) => Ue.rowId === r.id,
                            ) ? (
                              <IconMessageSquare size={13} />
                            ) : (
                              <IconEllipsis size={14} />
                            )}
                          </button>
                        </td>
                        {sheetProp.columns.map((Ue, Yl) => {
                          const Kt = { rowId: r.id, columnId: Ue.id },
                            zl = g?.rowId === r.id && g?.columnId === Ue.id,
                            hn =
                              xe &&
                              z >= xe.top &&
                              z <= xe.bottom &&
                              Yl >= xe.left &&
                              Yl <= xe.right,
                            Ui =
                              T?.rowId === r.id && T?.columnId === Ue.id
                                ? T
                                : null,
                            qi = (
                              <CellEditor
                                sheet={sheetProp}
                                row={r}
                                column={Ue}
                                line={L}
                                edit={Ui}
                                onActivate={() => Nl(Kt)}
                                onCommit={(it) => {
                                  (el(r.id, Ue.id, it), W(null));
                                }}
                                onCancel={(it) => {
                                  (W(null), it && fl(Kt));
                                }}
                                onNavigate={(it, xc) => Tt(it, xc, Kt)}
                              />
                            );
                          return (
                            <td
                              role={"gridcell"}
                              aria-selected={!!hn}
                              aria-label={`${Ue.title}, ligne ${L} : ${cellValue(sheetProp, r.id, Ue.id) === "" ? "vide" : cellValue(sheetProp, r.id, Ue.id)}`}
                              tabIndex={
                                zl || (!g && z === 0 && Yl === 0) ? 0 : -1
                              }
                              data-grid-cell={"true"}
                              data-row-id={r.id}
                              data-column-id={Ue.id}
                              className={`${Ue.id === ft?.id ? "sv-task-cell" : ""} ${hn ? "sv-range-cell" : ""} ${zl ? "sv-current-cell" : ""} ${Ui ? "sv-editing-cell" : ""}`}
                              onFocus={(it) => {
                                it.target === it.currentTarget &&
                                  !zl &&
                                  Nl(Kt, false, false);
                              }}
                              onKeyDown={(it) => fe(it, Kt)}
                              onPointerDown={(it) => {
                                it.button !== 0 ||
                                  (it.target as HTMLElement).closest(
                                    "input,select,button",
                                  ) ||
                                  (it.preventDefault(),
                                  (Lt.current = true),
                                  Nl(Kt, it.shiftKey));
                              }}
                              onPointerEnter={(it) => {
                                Lt.current &&
                                  it.buttons === 1 &&
                                  !T &&
                                  Nl(Kt, true);
                              }}
                              onDoubleClick={(it) => {
                                (it.target as HTMLElement).closest(
                                  "button,input,select",
                                ) || j(Kt);
                              }}
                              key={Ue.id}
                            >
                              {Ue.id === ft?.id ? (
                                <div
                                  className={"sv-task-inner"}
                                  style={{ paddingLeft: he * 20 }}
                                >
                                  {$ ? (
                                    <button
                                      className={"sv-collapse"}
                                      tabIndex={-1}
                                      aria-label={`${b.has(r.id) ? "Déplier" : "Replier"} ${r.cells[Ue.id]}`}
                                      onClick={(it) => {
                                        (it.stopPropagation(), yc(r.id));
                                      }}
                                    >
                                      {b.has(r.id) ? (
                                        <IconChevronRight size={14} />
                                      ) : (
                                        <IconChevronDown size={14} />
                                      )}
                                    </button>
                                  ) : (
                                    <span
                                      className={"sv-collapse-placeholder"}
                                    />
                                  )}
                                  {qi}
                                </div>
                              ) : (
                                qi
                              )}
                              {zl && !Ui && (
                                <span
                                  className={"sv-selection-handle"}
                                  aria-hidden={"true"}
                                />
                              )}
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    );
                  })}
                  <tr className={"sv-append"}>
                    <td />
                    <td />
                    <td colSpan={sheetProp.columns.length + 1}>
                      <button onClick={Yt}>
                        <IconPlus size={15} />
                        {" Ajouter une ligne"}
                      </button>
                    </td>
                  </tr>
                  {Array.from(
                    { length: Math.max(0, 12 - Ne.length) },
                    (r, z) => (
                      <tr
                        className={"sv-blank-row"}
                        aria-hidden={"true"}
                        key={`blank-${z}`}
                      >
                        <td className={"sv-row-number"}>
                          {sheetProp.rows.length + z + 1}
                        </td>
                        <td />
                        {sheetProp.columns.map((L) => (
                          <td key={L.id} />
                        ))}
                        <td />
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!Ne.length && sheetProp.rows.length > 0 && (
                <p className={"sv-empty"}>
                  {"Aucune ligne ne correspond à ces filtres."}
                </p>
              )}
            </div>
          )}
          {Cl === "gantt" && (
            <React.Fragment>
              <div className={"sv-view-subbar"}>
                <span>
                  <IconChartNoAxesGantt size={16} />
                  {" Planification"}
                </span>
                <div>
                  <ToolButton
                    title={"Déplacer le Gantt vers la gauche"}
                    onClick={() =>
                      nt.current?.scrollBy({
                        left: -350,
                        behavior: "smooth",
                      })
                    }
                  >
                    <IconChevronLeft size={17} />
                  </ToolButton>
                  <button
                    className={"sv-button sv-small"}
                    onClick={() =>
                      nt.current?.scrollTo({
                        left: Math.max(
                          0,
                          (Math.floor(Date.now() / 864e5) - Vt.start) * Gt -
                            260,
                        ),
                        behavior: "smooth",
                      })
                    }
                  >
                    {"Aujourd’hui"}
                  </button>
                  <ToolButton
                    title={"Déplacer le Gantt vers la droite"}
                    onClick={() =>
                      nt.current?.scrollBy({
                        left: 350,
                        behavior: "smooth",
                      })
                    }
                  >
                    <IconChevronRight size={17} />
                  </ToolButton>
                  <label>
                    {"Échelle"}
                    <select
                      aria-label={"Échelle du Gantt"}
                      value={Te}
                      onChange={(r) =>
                        Oe(
                          (
                            r.target as
                              | HTMLInputElement
                              | HTMLSelectElement
                              | HTMLTextAreaElement
                          ).value,
                        )
                      }
                    >
                      <option value={"day"}>{"Jours"}</option>
                      <option value={"week"}>{"Semaines"}</option>
                      <option value={"month"}>{"Mois"}</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className={"sv-gantt-scroll"} ref={nt}>
                <div
                  className={"sv-gantt"}
                  style={{ width: 480 + ml.length * Gt }}
                >
                  <div className={"sv-gantt-head"}>
                    <div className={"sv-gantt-task-head"}>
                      <span>{"Nom de la tâche"}</span>
                      <span>{"Début"}</span>
                      <span>{"Fin"}</span>
                    </div>
                    <div className={"sv-gantt-date-head"}>
                      <div className={"sv-months"}>
                        {ha.map((r) => (
                          <span style={{ width: r.count * Gt }} key={r.key}>
                            {new Date(r.day * 864e5).toLocaleDateString(
                              "fr-FR",
                              {
                                month: "long",
                                year: "numeric",
                                timeZone: "UTC",
                              },
                            )}
                          </span>
                        ))}
                      </div>
                      <div className={"sv-days"}>
                        {ml.map((r) => (
                          <span
                            className={
                              new Date(r * 864e5).getUTCDay() % 6 === 0
                                ? "sv-weekend"
                                : ""
                            }
                            style={{ width: Gt }}
                            key={String(r)}
                          >
                            {Te !== "month"
                              ? new Date(r * 864e5).getUTCDate()
                              : new Date(r * 864e5).getUTCDate() === 1
                                ? "1"
                                : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {Ne.map((r) => {
                    const z =
                        Xe?.rowId === r.id
                          ? {
                              ...r,
                              cells: {
                                ...r.cells,
                                start: serialDate(Xe.start),
                                end: serialDate(Xe.end),
                              },
                            }
                          : r,
                      L = ganttBar(z, Vt.start, Gt);
                    return (
                      <div
                        className={`sv-gantt-row ${p.has(r.id) ? "sv-selected" : ""}`}
                        key={r.id}
                      >
                        <button
                          className={"sv-gantt-task"}
                          onClick={() => {
                            (tl(r.id), re(r.id), we(false));
                          }}
                          title={String(r.cells[ft?.id] ?? "")}
                        >
                          <span
                            className={"sv-gantt-name"}
                            style={{
                              paddingLeft:
                                12 + rowDepth(r, sheetProp.rows) * 18,
                            }}
                          >
                            {r.cells[ft?.id] || "Sans titre"}
                          </span>
                          <span className={"sv-gantt-cell-date"}>
                            {displayDate(z.cells.start || "")}
                          </span>
                          <span className={"sv-gantt-cell-date"}>
                            {displayDate(z.cells.end || "")}
                          </span>
                        </button>
                        <div
                          className={"sv-gantt-track"}
                          style={{ backgroundSize: `${Gt}px 100%` }}
                        >
                          {ml
                            .filter(
                              ($) => new Date($ * 864e5).getUTCDay() % 6 === 0,
                            )
                            .map(($) => (
                              <span
                                className={"sv-gantt-weekend"}
                                style={{
                                  left: ($ - Vt.start) * Gt,
                                  width: Gt,
                                }}
                                key={$}
                              />
                            ))}
                          {L ? (
                            <button
                              className={`sv-gantt-bar sv-bar-${statusClass(r.cells.status)} ${Xe?.rowId === r.id ? "sv-bar-dragging" : ""}`}
                              style={{ left: L.left, width: L.width }}
                              aria-label={`${r.cells[ft?.id]} : ${displayDate(z.cells.start)} au ${displayDate(z.cells.end)}`}
                              onClick={() => {
                                if (De.current) {
                                  De.current = false;
                                  return;
                                }
                                (re(r.id), we(false));
                              }}
                              onPointerDown={($) => ma($, r)}
                              onPointerMove={gc}
                              onPointerUp={Us}
                              onPointerCancel={() => {
                                ((Ze.current = null), Y(null));
                              }}
                              onKeyDown={($) => {
                                if (
                                  $.key === "ArrowLeft" ||
                                  $.key === "ArrowRight"
                                ) {
                                  $.preventDefault();
                                  const he = $.key === "ArrowLeft" ? -1 : 1,
                                    Ue = dateSerial(r.cells.start),
                                    Yl = dateSerial(r.cells.end);
                                  Ri(
                                    r.id,
                                    $.shiftKey ? Ue : Ue + he,
                                    $.shiftKey
                                      ? Math.max(Ue, Yl + he)
                                      : Yl + he,
                                  );
                                }
                              }}
                              title={`${r.cells[ft?.id]} \xB7 ${L.duration} jours \xB7 Glisser pour d\xE9placer, bords pour redimensionner. Clavier : \u2190 \u2192 ; Maj pour modifier la fin.`}
                            >
                              <i
                                style={{
                                  width: `${Math.max(0, Math.min(100, Number(cellValue(sheetProp, r.id, "progress")) || 0))}%`,
                                }}
                              />
                              <span>{r.cells[ft?.id]}</span>
                              <span
                                className={"sv-bar-handle sv-handle-start"}
                                title={"Déplacer la date de début"}
                                aria-label={`Redimensionner le d\xE9but de ${r.cells[ft?.id]}`}
                                onPointerDown={($) => ma($, r, "start")}
                              />
                              <span
                                className={"sv-bar-handle sv-handle-end"}
                                title={"Déplacer la date de fin"}
                                aria-label={`Redimensionner la fin de ${r.cells[ft?.id]}`}
                                onPointerDown={($) => ma($, r, "end")}
                              />
                            </button>
                          ) : (
                            <button
                              className={"sv-undated"}
                              onClick={() => {
                                (re(r.id), we(false));
                              }}
                            >
                              {"Définir les dates"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {On.links.length > 0 && (
                    <svg
                      className={"sv-gantt-links"}
                      style={{
                        left: 480,
                        top: 54,
                        width: ml.length * Gt,
                        height: Ne.length * 36,
                      }}
                      aria-label={"Liaisons des prédécesseurs"}
                      role={"img"}
                    >
                      <defs>
                        <marker
                          id={zt.current}
                          viewBox={"0 0 8 8"}
                          refX={"7"}
                          refY={"4"}
                          markerWidth={"5"}
                          markerHeight={"5"}
                          orient={"auto-start-reverse"}
                        >
                          <path d={"M 0 0 L 8 4 L 0 8 z"} fill={"#8a80a7"} />
                        </marker>
                      </defs>
                      {On.links.map((r) => (
                        <path
                          d={`M ${r.x1} ${r.y1} H ${r.x1 + 10} V ${r.y2} H ${r.x2}`}
                          fill={"none"}
                          stroke={"#8a80a7"}
                          strokeWidth={"1.3"}
                          markerEnd={`url(#${zt.current})`}
                          key={r.fromId + r.toId}
                        />
                      ))}
                    </svg>
                  )}
                  {!Ne.length && (
                    <p className={"sv-empty"}>
                      {
                        "Ajoutez des lignes et renseignez les dates de début et de fin."
                      }
                    </p>
                  )}
                </div>
              </div>
              <div className={"sv-view-hint"}>
                {
                  "Glissez une barre pour déplacer la tâche, ses bords pour ajuster la durée. Clavier : ← → ; Maj pour la fin. "
                }
                {oa > 0 && (
                  <strong>
                    {oa}
                    {" tâche(s) dépassent la période affichée du "}
                    {displayDate(serialDate(Vt.start))}
                    {" au "}
                    {displayDate(serialDate(Vt.end))}
                    {
                      " (3 ans maximum). Leurs dates restent accessibles à gauche."
                    }
                  </strong>
                )}
                {On.links.length > 0 && (
                  <span>
                    {
                      " Liaisons visuelles selon les numéros de prédécesseurs ; aucun décalage automatique des dates."
                    }
                  </span>
                )}
                {On.unsupported > 0 && (
                  <strong>
                    {" "}
                    {On.unsupported}
                    {
                      " référence(s) ignorée(s) : seuls les numéros de ligne séparés par des virgules sont pris en charge."
                    }
                  </strong>
                )}
              </div>
            </React.Fragment>
          )}
          {Cl === "cards" && (
            <React.Fragment>
              <div className={"sv-view-subbar"}>
                <span>
                  <IconLayoutGrid size={16} />
                  {" Regroupement : "}
                  {At?.title || "Toutes les lignes"}
                </span>
                <span className={"sv-muted"}>
                  {"Déplacez les cartes pour changer leur statut"}
                </span>
              </div>
              <div className={"sv-board"}>
                {Ba.map((r) => {
                  const z = Ne.filter(
                    (L) => !At || (L.cells[At.id] || "Sans statut") === r,
                  );
                  return (
                    <section
                      className={`sv-lane sv-lane-${statusClass(r)}`}
                      onDragOver={(L) => {
                        At && L.preventDefault();
                      }}
                      onDrop={(L) => {
                        L.preventDefault();
                        const $ = L.dataTransfer.getData(
                          "application/x-local-sheet-row",
                        );
                        At &&
                          sheetProp.rows.some((he) => he.id === $) &&
                          el($, At.id, r === "Sans statut" ? "" : r);
                      }}
                      key={String(r)}
                    >
                      <h3>
                        <span
                          className={`sv-status-dot sv-dot-${statusClass(r)}`}
                        />
                        {r}
                        <span>{z.length}</span>
                      </h3>
                      <div className={"sv-card-list"}>
                        {z.map((L) => (
                          <article
                            className={"sv-card"}
                            draggable={true}
                            onDragStart={($) => qs($, L)}
                            style={{ background: L.format?.background }}
                            key={L.id}
                          >
                            <button
                              className={"sv-card-title"}
                              onClick={() => {
                                (re(L.id), we(false), tl(L.id));
                              }}
                            >
                              {L.cells[ft?.id] || "Sans titre"}
                            </button>
                            {L.cells.owner && (
                              <div className={"sv-card-owner"}>
                                <span>
                                  {String(L.cells.owner)
                                    .split(/\s+/)
                                    .map(($) => $[0])
                                    .slice(0, 2)
                                    .join("")
                                    .toUpperCase()}
                                </span>
                                {L.cells.owner}
                              </div>
                            )}
                            {(L.cells.start || L.cells.end) && (
                              <div className={"sv-card-date"}>
                                <IconCalendarDays size={13} />
                                {displayDate(L.cells.start)}
                                {L.cells.end
                                  ? ` \u2192 ${displayDate(L.cells.end)}`
                                  : ""}
                              </div>
                            )}
                            {L.cells.progress !== "" &&
                              L.cells.progress != null && (
                                <div className={"sv-card-progress"}>
                                  <span
                                    style={{
                                      width: `${Math.max(0, Math.min(100, Number(cellValue(sheetProp, L.id, "progress")) || 0))}%`,
                                    }}
                                  />
                                </div>
                              )}
                            {At && (
                              <select
                                aria-label={`Statut de ${L.cells[ft?.id] || "la carte"}`}
                                value={String(L.cells[At.id] || "")}
                                onChange={($) =>
                                  el(
                                    L.id,
                                    At.id,
                                    (
                                      $.target as
                                        | HTMLInputElement
                                        | HTMLSelectElement
                                        | HTMLTextAreaElement
                                    ).value,
                                  )
                                }
                              >
                                <option value={""}>{"Sans statut"}</option>
                                {Ba.filter(($) => $ !== "Sans statut").map(
                                  ($) => (
                                    <option key={String($)}>{$}</option>
                                  ),
                                )}
                              </select>
                            )}
                          </article>
                        ))}
                      </div>
                      <button
                        className={"sv-lane-add"}
                        onClick={() => {
                          const L = appendRow(sheetProp),
                            $ = L.rows.at(-1);
                          (At &&
                            ($.cells[At.id] = r === "Sans statut" ? "" : r),
                            ($.cells[ft.id] = "Nouvelle tâche"),
                            Ke(L),
                            re($.id),
                            we(false));
                        }}
                      >
                        <IconPlus size={15} />
                        {" Ajouter une carte"}
                      </button>
                    </section>
                  );
                })}
              </div>
            </React.Fragment>
          )}
          {Cl === "calendar" && (
            <React.Fragment>
              <div className={"sv-view-subbar"}>
                <div>
                  <ToolButton title={"Mois précédent"} onClick={() => mn(-1)}>
                    <IconChevronLeft size={18} />
                  </ToolButton>
                  <ToolButton title={"Mois suivant"} onClick={() => mn(1)}>
                    <IconChevronRight size={18} />
                  </ToolButton>
                  <h3>
                    {Ya.toLocaleDateString("fr-FR", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </h3>
                  <button
                    className={"sv-button sv-small"}
                    onClick={() =>
                      ke(/* @__PURE__ */ new Date().toISOString().slice(0, 7))
                    }
                  >
                    {"Aujourd’hui"}
                  </button>
                </div>
                <span className={"sv-muted"}>{"Dates de début et de fin"}</span>
              </div>
              <div className={"sv-calendar-scroll"}>
                <div className={"sv-calendar"}>
                  <div className={"sv-calendar-weekdays"}>
                    {[
                      "Lundi",
                      "Mardi",
                      "Mercredi",
                      "Jeudi",
                      "Vendredi",
                      "Samedi",
                      "Dimanche",
                    ].map((r) => (
                      <span key={String(r)}>{r}</span>
                    ))}
                  </div>
                  <div className={"sv-calendar-days"}>
                    {St.map((r) => {
                      const z = serialDate(r),
                        L = Ne.filter(($) => {
                          const he = dateSerial($.cells.start),
                            Ue = dateSerial($.cells.end) ?? he;
                          return he !== null && r >= he && r <= Ue;
                        });
                      return (
                        <section
                          className={`${z.slice(0, 7) !== Ye ? "sv-outside-month" : ""} ${z === /* @__PURE__ */ new Date().toISOString().slice(0, 10) ? "sv-today" : ""}`}
                          key={String(r)}
                        >
                          <header>
                            <span>{Number(z.slice(-2))}</span>
                            <button
                              disabled={!Mt}
                              title={
                                Mt
                                  ? "Ajouter une tâche"
                                  : "Les colonnes Date de début et Date de fin sont nécessaires"
                              }
                              aria-label={`Ajouter une t\xE2che le ${displayDate(z)}`}
                              onClick={() => {
                                const $ = appendRow(sheetProp),
                                  he = $.rows.at(-1);
                                ((he.cells.start = z),
                                  (he.cells.end = z),
                                  (he.cells[ft.id] = "Nouvelle tâche"),
                                  Ke($),
                                  re(he.id),
                                  we(false));
                              }}
                            >
                              <IconPlus size={13} />
                            </button>
                          </header>
                          {L.map(($) => (
                            <button
                              className={`sv-calendar-task sv-calendar-${statusClass($.cells.status)}`}
                              title={String($.cells[ft?.id] ?? "")}
                              onClick={() => {
                                (re($.id), we(false));
                              }}
                              key={$.id}
                            >
                              {$.cells[ft?.id] || "Sans titre"}
                            </button>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className={"sv-view-hint"}>
                {!Mt &&
                  "Les colonnes standard Date de début et Date de fin sont nécessaires pour créer des tâches ici. "}
                {Ne.filter((r) => dateSerial(r.cells.start) === null).length}
                {" ligne(s) sans date de début ne figurent pas dans l’agenda."}
              </div>
            </React.Fragment>
          )}
        </div>
        {nl && (
          <aside className={"sv-sidepanel"}>
            <header>
              <div>
                <small>
                  {"LIGNE "}
                  {sheetProp.rows.findIndex((r) => r.id === nl.id) + 1}
                </small>
                <h3>{"Détails de la ligne"}</h3>
              </div>
              <ToolButton title={"Fermer les détails"} onClick={() => re(null)}>
                <IconX size={19} />
              </ToolButton>
            </header>
            <div className={"sv-side-scroll"}>
              <div className={"sv-detail-fields"}>
                {sheetProp.columns.map((r) => (
                  <div className={"sv-detail-field"} key={r.id}>
                    <label>{r.title}</label>
                    <CellContent
                      detail={true}
                      sheet={sheetProp}
                      row={nl}
                      column={r}
                      line={sheetProp.rows.findIndex((z) => z.id === nl.id) + 1}
                      onSelect={() => tl(nl.id)}
                      onSave={(z) => el(nl.id, r.id, z)}
                    />
                  </div>
                ))}
              </div>
              <div className={"sv-comments"}>
                <h4>
                  <IconMessageSquare size={16} />
                  {" Conversations "}
                  <span>
                    {
                      (sheetProp.comments || []).filter(
                        (r) => r.rowId === nl.id,
                      ).length
                    }
                  </span>
                </h4>
                {(sheetProp.comments || [])
                  .filter((r) => r.rowId === nl.id)
                  .map((r) => (
                    <article className={"sv-comment"} key={r.id}>
                      <div>
                        <strong>{r.author}</strong>
                        <time>
                          {new Date(r.createdAt).toLocaleString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p>{r.text}</p>
                    </article>
                  ))}
                <form
                  onSubmit={(r) => {
                    (r.preventDefault(),
                      ue.trim() &&
                        (Ke({
                          ...sheetProp,
                          comments: [
                            ...(sheetProp.comments || []),
                            {
                              id: newId("comment"),
                              rowId: nl.id,
                              text: ue.trim(),
                              author: "Vous",
                              createdAt:
                                /* @__PURE__ */ new Date().toISOString(),
                            },
                          ],
                        }),
                        be("")));
                  }}
                >
                  <textarea
                    aria-label={"Ajouter un commentaire"}
                    placeholder={"Écrire un commentaire…"}
                    rows={3}
                    value={ue}
                    onChange={(r) =>
                      be(
                        (
                          r.target as
                            | HTMLInputElement
                            | HTMLSelectElement
                            | HTMLTextAreaElement
                        ).value,
                      )
                    }
                  />
                  <button
                    type={"submit"}
                    className={"sv-button sv-primary"}
                    disabled={!ue.trim()}
                  >
                    {"Publier le commentaire"}
                  </button>
                </form>
                <p className={"sv-hint"}>
                  {"Commentaires enregistrés dans cet espace de travail."}
                </p>
              </div>
            </div>
          </aside>
        )}
        {ge && (
          <aside className={"sv-sidepanel"}>
            <header>
              <h3>{"Récapitulatif de la feuille"}</h3>
              <ToolButton
                title={"Fermer le récapitulatif"}
                onClick={() => we(false)}
              >
                <IconX size={19} />
              </ToolButton>
            </header>
            <div className={"sv-side-scroll sv-summary"}>
              <div>
                <span>{"Lignes"}</span>
                <strong>{sheetProp.rows.length}</strong>
              </div>
              <div>
                <span>{"Tâches terminées"}</span>
                <strong>
                  {
                    sheetProp.rows.filter((r) => r.cells.status === "Terminé")
                      .length
                  }
                </strong>
              </div>
              <div>
                <span>{"Avancement moyen"}</span>
                <strong>
                  {sheetProp.rows.length
                    ? Math.round(
                        sheetProp.rows.reduce(
                          (r, z) =>
                            r +
                            (Number(cellValue(sheetProp, z.id, "progress")) ||
                              0),
                          0,
                        ) / sheetProp.rows.length,
                      )
                    : 0}
                  {"%"}
                </strong>
              </div>
              {sheetProp.columns
                .filter((r) => r.type === "number" && r.id !== "progress")
                .map((r) => (
                  <div key={r.id}>
                    <span>
                      {"Total · "}
                      {r.title}
                    </span>
                    <strong>
                      {sheetProp.rows
                        .reduce(
                          (z, L) =>
                            z + (Number(cellValue(sheetProp, L.id, r.id)) || 0),
                          0,
                        )
                        .toLocaleString("fr-FR", {
                          maximumFractionDigits: 2,
                        })}
                    </strong>
                  </div>
                ))}
              <p className={"sv-hint"}>
                {
                  "Calculé sur l’ensemble de la feuille, y compris les lignes filtrées."
                }
              </p>
            </div>
          </aside>
        )}
      </div>
      <footer className={"sv-footer"}>
        <span>
          {sheetProp.rows.length}
          {" ligne"}
          {sheetProp.rows.length > 1 ? "s" : ""}
          {" · "}
          {sheetProp.columns.length}
          {" colonnes"}
        </span>
        {xe ? (
          <span>
            {(xe.bottom - xe.top + 1) * (xe.right - xe.left + 1)}
            {" cellule(s) sélectionnée(s)"}
          </span>
        ) : (
          Je.length > 0 && (
            <span>
              {Je.length}
              {" ligne(s) sélectionnée(s)"}
            </span>
          )
        )}
        <span className={"sv-toolbar-spacer"} />
        <span title={saveErrorProp || void 0}>
          {saveStatusProp === "saved"
            ? "Enregistré en ligne"
            : saveStatusProp === "saving"
              ? "Enregistrement en cours…"
              : saveStatusProp === "pending"
                ? "Modifications en attente"
                : saveStatusProp === "error"
                  ? "Échec de l’enregistrement"
                  : "Sauvegarde locale"}
        </span>
        <span
          className={`sv-save-dot sv-save-${saveStatusProp || "unknown"}`}
        />
      </footer>
      {ae && (
        <div
          ref={Ll}
          className={"sv-menu sv-context-menu"}
          role={"menu"}
          aria-label={
            ae.kind === "row" ? "Options de la ligne" : "Options de la colonne"
          }
          style={{ left: Math.max(8, ae.x), top: Math.max(8, ae.y) }}
          onKeyDown={(r) => {
            const z = [
                ...(Ll.current as HTMLElement).querySelectorAll<HTMLElement>(
                  "button:not(:disabled)",
                ),
              ],
              L = z.indexOf(document.activeElement as HTMLElement);
            ((r.key === "ArrowDown" || r.key === "ArrowUp") &&
              (r.preventDefault(),
              z[
                (L + (r.key === "ArrowDown" ? 1 : -1) + z.length) % z.length
              ]?.focus()),
              r.key === "Escape" && (r.stopPropagation(), le(null), fl(g)));
          }}
        >
          {al && (
            <React.Fragment>
              <strong className={"sv-menu-caption"}>
                {"Ligne "}
                {sheetProp.rows.findIndex((r) => r.id === al.id) + 1}
              </strong>
              <button role={"menuitem"} onClick={() => ks(al.id, "before")}>
                <IconArrowUp size={16} />
                {" Insérer une ligne au-dessus"}
              </button>
              <button role={"menuitem"} onClick={() => ks(al.id, "after")}>
                <IconArrowDown size={16} />
                {" Insérer une ligne en dessous"}
              </button>
              <button
                role={"menuitem"}
                onClick={() => {
                  const r = insertRow(Ae.current, al.id),
                    z = r.rows.find(
                      (L) => !Ae.current.rows.some(($) => $.id === L.id),
                    );
                  ((z.cells = clone(al.cells)),
                    al.format && (z.format = clone(al.format)),
                    Ke(r),
                    le(null),
                    onNoticeProp("Ligne dupliquée."));
                }}
              >
                <IconCopy size={16} />
                {" Dupliquer la ligne"}
              </button>
              <span className={"sv-menu-divider"} />
              <button
                role={"menuitem"}
                onClick={() => {
                  (re(al.id), we(false), le(null));
                }}
              >
                <IconPanelRight size={16} />
                {" Détails de la ligne"}
              </button>
              <button
                role={"menuitem"}
                onClick={() => {
                  (re(al.id), we(false), le(null));
                }}
              >
                <IconMessageSquare size={16} />
                {" Conversations"}
              </button>
              <span className={"sv-menu-divider"} />
              <button
                role={"menuitem"}
                className={"sv-menu-danger"}
                onClick={() => {
                  const r = p.has(al.id) ? Je : [al.id],
                    z = descendantIds(sheetProp.rows, r).size;
                  (Ke(deleteRows(Ae.current, r)),
                    R(/* @__PURE__ */ new Set<string>()),
                    B(null),
                    te(null),
                    le(null),
                    onNoticeProp(
                      `${z} ligne(s) supprim\xE9e(s). Ctrl+Z pour annuler.`,
                    ));
                }}
              >
                <IconTrash2 size={16} />
                {" Supprimer "}
                {Je.length > 1 ? `${Je.length} lignes` : "la ligne"}
              </button>
            </React.Fragment>
          )}
          {hl && (
            <React.Fragment>
              <strong className={"sv-menu-caption"}>{hl.title}</strong>
              <button role={"menuitem"} onClick={() => va(hl)}>
                <IconColumns3 size={16} />
                {" Modifier les propriétés…"}
              </button>
              <button
                role={"menuitem"}
                onClick={() => {
                  (ee({
                    type: "column",
                    column: null,
                    position: sheetProp.columns.findIndex(
                      (r) => r.id === hl.id,
                    ),
                  }),
                    le(null));
                }}
              >
                <IconPlus size={16} />
                {" Insérer une colonne à gauche"}
              </button>
              <button
                role={"menuitem"}
                onClick={() => {
                  (ee({
                    type: "column",
                    column: null,
                    position:
                      sheetProp.columns.findIndex((r) => r.id === hl.id) + 1,
                  }),
                    le(null));
                }}
              >
                <IconPlus size={16} />
                {" Insérer une colonne à droite"}
              </button>
              <span className={"sv-menu-divider"} />
              <button
                role={"menuitem"}
                onClick={() => {
                  (J({ columnId: hl.id, direction: "asc" }), le(null));
                }}
              >
                <IconArrowUp size={16} />
                {" Trier par ordre croissant"}
              </button>
              <button
                role={"menuitem"}
                onClick={() => {
                  (J({ columnId: hl.id, direction: "desc" }), le(null));
                }}
              >
                <IconArrowDown size={16} />
                {" Trier par ordre décroissant"}
              </button>
              <button
                role={"menuitem"}
                disabled={!Ne.length}
                onClick={() => {
                  const r = { rowId: Ne[0].id, columnId: hl.id },
                    z = { rowId: Ne.at(-1).id, columnId: hl.id };
                  (te(r),
                    B(z),
                    R(new Set(Ne.map((L) => L.id))),
                    le(null),
                    fl(z));
                }}
              >
                <IconCheck size={16} />
                {" Sélectionner la colonne"}
              </button>
              <span className={"sv-menu-divider"} />
              <button
                role={"menuitem"}
                className={"sv-menu-danger"}
                disabled={hl.id === ft?.id}
                onClick={() => {
                  (ee({ type: "deleteColumn", column: hl }), le(null));
                }}
              >
                <IconTrash2 size={16} />
                {" Supprimer la colonne"}
              </button>
            </React.Fragment>
          )}
        </div>
      )}
      {P?.type === "column" && (
        <ColumnDialog
          sheet={sheetProp}
          initial={P.column}
          initialPosition={P.position}
          onClose={() => ee(null)}
          onDelete={(r) => ee({ type: "deleteColumn", column: r })}
          onSave={(r, z) => {
            const L = sheetProp.columns.filter(($) => $.id !== r.id);
            (L.splice(z, 0, r),
              Ke({
                ...sheetProp,
                columns: L,
                rows:
                  P.column && r.type !== P.column.type
                    ? sheetProp.rows.map(($) => ({
                        ...$,
                        cells: {
                          ...$.cells,
                          [r.id]: coerceCell($.cells[r.id], r),
                        },
                      }))
                    : sheetProp.rows,
              }),
              ee(null));
          }}
        />
      )}
      {P?.type === "deleteColumn" && (
        <SheetModal title={"Supprimer la colonne"} onClose={() => ee(null)}>
          <p>
            {"Supprimer la colonne « "}
            {P.column.title}
            {
              " » et toutes ses valeurs ? Les formules et formulaires qui utilisent cette colonne devront être mis à jour. Vous pourrez annuler cette action."
            }
          </p>
          <footer>
            <button className={"sv-button"} onClick={() => ee(null)}>
              {"Annuler"}
            </button>
            <button
              className={"sv-button sv-danger"}
              onClick={() => {
                const r = P.column.id;
                (Ke({
                  ...sheetProp,
                  columns: sheetProp.columns.filter((z) => z.id !== r),
                  rows: sheetProp.rows.map((z) => {
                    const L = { ...z.cells };
                    return (delete L[r], { ...z, cells: L });
                  }),
                  forms: (sheetProp.forms || []).map((z) => ({
                    ...z,
                    fields: z.fields.filter((L) => L.columnId !== r),
                  })),
                }),
                  ee(null));
              }}
            >
              {"Supprimer la colonne"}
            </button>
          </footer>
        </SheetModal>
      )}
      {P?.type === "deleteRows" && (
        <SheetModal title={"Supprimer les lignes"} onClose={() => ee(null)}>
          <p>
            {"Supprimer "}
            {descendantIds(sheetProp.rows, Je).size}
            {" ligne(s)"}
            {descendantIds(sheetProp.rows, Je).size > Je.length
              ? " et leurs sous-lignes"
              : ""}
            {" ? Vous pourrez annuler cette action."}
          </p>
          <footer>
            <button className={"sv-button"} onClick={() => ee(null)}>
              {"Annuler"}
            </button>
            <button
              className={"sv-button sv-danger"}
              onClick={() => {
                (Ke(deleteRows(sheetProp, Je)),
                  R(/* @__PURE__ */ new Set<string>()),
                  ee(null));
              }}
            >
              {"Supprimer"}
            </button>
          </footer>
        </SheetModal>
      )}
      {P?.type === "formula" && (
        <SheetModal title={"Insérer une formule"} onClose={() => ee(null)}>
          <form
            onSubmit={(r) => {
              (r.preventDefault(),
                I.startsWith("=") &&
                  (Ke({
                    ...sheetProp,
                    rows: sheetProp.rows.map((z) =>
                      p.has(z.id)
                        ? { ...z, cells: { ...z.cells, [ye]: I } }
                        : z,
                    ),
                  }),
                  ee(null)));
            }}
          >
            <p>
              {"La formule sera appliquée aux "}
              {Je.length}
              {" ligne(s) sélectionnée(s)."}
            </p>
            <label>
              {"Colonne"}
              <select
                value={ye}
                onChange={(r) =>
                  et(
                    (
                      r.target as
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement
                    ).value,
                  )
                }
              >
                {sheetProp.columns.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {"Formule"}
              <input
                value={I}
                onChange={(r) =>
                  ve(
                    (
                      r.target as
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement
                    ).value,
                  )
                }
                placeholder={`=SUM([${fa}]1:[${fa}]3)`}
                required={true}
                pattern={"=.*"}
              />
            </label>
            <div className={"sv-formula-help"}>
              <p>
                <code>{`=[${fa}]@row * 1.2`}</code>
                {" · calcul sur la ligne actuelle"}
              </p>
              <p>
                <code>{`=SUM([${fa}]1:[${fa}]3)`}</code>
                {" · total d’une plage"}
              </p>
              <p>
                {
                  "Fonctions : SUM, AVG, COUNT, MIN, MAX. Opérateurs : + − * / et parenthèses. Les références numérotées suivent les positions des lignes."
                }
              </p>
            </div>
            <footer>
              <button
                type={"button"}
                className={"sv-button"}
                onClick={() => ee(null)}
              >
                {"Annuler"}
              </button>
              <button type={"submit"} className={"sv-button sv-primary"}>
                {"Appliquer"}
              </button>
            </footer>
          </form>
        </SheetModal>
      )}
    </div>
  );
}
