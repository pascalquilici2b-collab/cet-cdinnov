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
  ArrowUp as IconArrowUp,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  Clock3 as IconClock3,
  Copy as IconCopy,
  Ellipsis as IconEllipsis,
  FileSpreadsheet as IconFileSpreadsheet,
  Folder as IconFolder,
  FolderOpen as IconFolderOpen,
  FolderPlus as IconFolderPlus,
  LayoutDashboard as IconLayoutDashboard,
  Plus as IconPlus,
  Search as IconSearch,
  Star as IconStar,
  Upload as IconUpload,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
export const itemLabels = {
  workspace: "Espace de travail",
  folder: "Dossier",
  sheet: "Feuille",
  dashboard: "Tableau de bord",
};
export const itemKey = (c) => `${c.kind}:${c.id}`;
export const normalizeSearch = (c) =>
  String(c ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
export const itemDate = (c) => c.updatedAt || c.createdAt || "";
export function itemSortDate(c) {
  return !c || !Number.isFinite(Date.parse(c))
    ? "—"
    : new Date(c).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function ItemKindIcon({
  kind: kindProp,
  open: openProp = false,
  size: sizeProp = 16,
}) {
  const o =
    kindProp === "workspace"
      ? IconUsers
      : kindProp === "folder"
        ? openProp
          ? IconFolderOpen
          : IconFolder
        : kindProp === "dashboard"
          ? IconLayoutDashboard
          : IconFileSpreadsheet;
  return jsxRuntime.jsx(o, {
    size: sizeProp,
    className: `bv-item-icon bv-icon-${kindProp}`,
    "aria-hidden": "true",
  });
}
export function BrowseView({
  state: stateProp,
  route: routeProp = ["browse"],
  recents: recentsProp = [],
  onNavigate: onNavigateProp,
  onOpenItem: onOpenItemProp,
  onFavorite: onFavoriteProp,
  onCreate: onCreateProp,
  onImport: onImportProp,
  onMove: onMoveProp,
  onDuplicate: onDuplicateProp,
}) {
  const [k, x] = React.useState(""),
    [N, V] = React.useState({ key: "name", direction: "asc" }),
    [G, H] = React.useState(null),
    [q, J] = React.useState(true),
    [Z, F] = React.useState(
      () => new Set(routeProp[0] === "workspace" ? [routeProp[1]] : []),
    ),
    [P, ee] = React.useState(null),
    Se = React.useRef(null),
    re = React.useRef(null),
    ue = stateProp.workspaces || [],
    be =
      routeProp[0] === "workspace"
        ? ue.find((T) => T.id === routeProp[1])
        : null,
    ge = be?.folders?.find((T) => T.id === routeProp[2]),
    we = routeProp.join("/"),
    Te = React.useMemo(
      () => [
        ...(stateProp.sheets || []).map((T) => ({ ...T, kind: "sheet" })),
        ...(stateProp.dashboards || []).map((T) => ({
          ...T,
          kind: "dashboard",
        })),
      ],
      [stateProp.sheets, stateProp.dashboards],
    ),
    Oe = { workspaceId: be?.id || ue[0]?.id || null, folderId: ge?.id || null },
    Ye =
      routeProp[0] === "favorites"
        ? "Favoris"
        : routeProp[0] === "recents"
          ? "Éléments récents"
          : be
            ? ge?.name || be.name
            : routeProp[1] === "sheets"
              ? "Feuilles"
              : "Espaces de travail",
    ke = React.useMemo(() => {
      if (routeProp[0] === "favorites") return Te.filter((T) => T.favorite);
      if (routeProp[0] === "recents")
        return recentsProp.flatMap((T) => {
          const W = Te.find((ae) => ae.id === T);
          return W ? [W] : [];
        });
      if (be) {
        const T = ge?.id || null;
        return [
          ...(T
            ? []
            : (be.folders || []).map((ae) => ({
                ...ae,
                workspaceId: be.id,
                kind: "folder",
              }))),
          ...Te.filter(
            (ae) => ae.workspaceId === be.id && (ae.folderId || null) === T,
          ),
        ];
      }
      return routeProp[1] === "sheets"
        ? Te.filter((T) => T.kind === "sheet")
        : ue.map((T) => ({ ...T, kind: "workspace" }));
    }, [Te, be, ge, ue, recentsProp, we]),
    C = React.useMemo(
      () =>
        [
          ...ke.filter(
            (W) =>
              !k.trim() ||
              normalizeSearch(W.name).includes(normalizeSearch(k.trim())),
          ),
        ].sort((W, ae) => {
          if (N.key === "recent")
            return recentsProp.indexOf(W.id) - recentsProp.indexOf(ae.id);
          const le =
              N.key === "type"
                ? itemLabels[W.kind]
                : N.key === "date"
                  ? itemDate(W)
                  : W.name,
            me =
              N.key === "type"
                ? itemLabels[ae.kind]
                : N.key === "date"
                  ? itemDate(ae)
                  : ae.name,
            Qe = String(le).localeCompare(String(me), "fr", {
              numeric: true,
              sensitivity: "base",
            });
          return (
            (N.direction === "desc" ? -Qe : Qe) ||
            W.name.localeCompare(ae.name, "fr")
          );
        }),
      [ke, k, N, recentsProp],
    ),
    ne = C.find((T) => itemKey(T) === G),
    I = (T) => T && ["sheet", "dashboard"].includes(T.kind);
  (React.useEffect(() => {
    (x(""),
      H(null),
      ee(null),
      V({
        key: routeProp[0] === "recents" ? "recent" : "name",
        direction: "asc",
      }),
      routeProp[0] === "workspace" &&
        (J(true), F((T) => /* @__PURE__ */ new Set([...T, routeProp[1]]))));
  }, [we]),
    React.useEffect(() => {
      const T = (ae) => {
          (ae.target as HTMLElement).closest?.("[data-bv-menu]") || ee(null);
        },
        W = (ae) => {
          ae.key === "Escape" && ee(null);
        };
      return (
        document.addEventListener("pointerdown", T),
        document.addEventListener("keydown", W),
        () => {
          (document.removeEventListener("pointerdown", T),
            document.removeEventListener("keydown", W));
        }
      );
    }, []));
  const ve = (T) => {
      (ee(null), onNavigateProp?.(T));
    },
    ye = (T) => {
      T &&
        (ee(null),
        T.kind === "workspace"
          ? ve(`/workspace/${encodeURIComponent(T.id)}`)
          : T.kind === "folder"
            ? ve(
                `/workspace/${encodeURIComponent(T.workspaceId)}/${encodeURIComponent(T.id)}`,
              )
            : onOpenItemProp?.(T));
    },
    et = (T) =>
      V((W) => ({
        key: T,
        direction: W.key === T && W.direction === "asc" ? "desc" : "asc",
      })),
    Xe = (T) =>
      F((W) => {
        const ae = new Set(W);
        return (ae.has(T) ? ae.delete(T) : ae.add(T), ae);
      }),
    Y = (T) => {
      (ee(null), onCreateProp?.(T, Oe));
    },
    g = (T, W) => {
      (T.preventDefault(), T.stopPropagation(), H(itemKey(W)));
      const ae = T.currentTarget.getBoundingClientRect();
      ee({
        type: "row",
        item: W,
        x: Math.min(
          T.type === "contextmenu" ? T.clientX : ae.right,
          window.innerWidth - 220,
        ),
        y: Math.min(
          T.type === "contextmenu" ? T.clientY : ae.bottom,
          window.innerHeight - 160,
        ),
      });
    },
    B = (T) => {
      if ((T.target as HTMLElement).closest("button,input") || !C.length)
        return;
      const W = C.findIndex((le) => itemKey(le) === G);
      let ae;
      if (T.key === "ArrowDown") ae = Math.min(W + 1, C.length - 1);
      else if (T.key === "ArrowUp") ae = Math.max(W - 1, 0);
      else if (T.key === "Home") ae = 0;
      else if (T.key === "End") ae = C.length - 1;
      else if (T.key === "Enter") {
        (T.preventDefault(), ye(ne || C[0]));
        return;
      } else return;
      (T.preventDefault(),
        H(itemKey(C[ae])),
        (re.current as HTMLElement)
          ?.querySelectorAll<HTMLElement>("tbody tr[data-bv-row]")
          [ae]?.focus());
    },
    ie = (T) => (
      <React.Fragment>
        <button role={"menuitem"} onClick={() => ye(T)} disabled={!T}>
          <IconFolderOpen size={15} />
          {"Ouvrir"}
        </button>
        <button
          role={"menuitem"}
          disabled={!I(T) || !onMoveProp}
          onClick={() => {
            (ee(null), onMoveProp?.(T));
          }}
        >
          <IconFolder size={15} />
          {"Déplacer vers…"}
        </button>
        <button
          role={"menuitem"}
          disabled={!I(T) || !onDuplicateProp}
          onClick={() => {
            (ee(null), onDuplicateProp?.(T));
          }}
        >
          <IconCopy size={15} />
          {"Enregistrer une copie…"}
        </button>
      </React.Fragment>
    ),
    te = (T, W) => (
      <button
        onClick={() => et(T)}
        title={`Trier par ${W.toLocaleLowerCase("fr")}`}
      >
        {W}
        {N.key === T &&
          (N.direction === "asc" ? (
            <IconArrowUp size={12} />
          ) : (
            <IconArrowDown size={12} />
          ))}
      </button>
    );
  return (
    <section
      className={"bv-root"}
      ref={Se}
      aria-label={"Parcourir les éléments"}
    >
      <aside
        className={"bv-sidebar"}
        aria-label={"Arborescence des espaces de travail"}
      >
        <h1>{"Parcourir"}</h1>
        <div
          className={"bv-tree"}
          role={"navigation"}
          aria-label={"Dossiers et espaces"}
        >
          <button
            className={`bv-tree-line bv-tree-top ${routeProp[0] === "browse" && routeProp[1] === "sheets" ? "bv-tree-selected" : ""}`}
            onClick={() => ve("/browse/sheets")}
          >
            <span className={"bv-tree-indent"} />
            <IconFileSpreadsheet size={16} />
            <span>{"Feuilles"}</span>
          </button>
          <div
            className={`bv-tree-line bv-tree-top ${routeProp[0] === "browse" && !routeProp[1] ? "bv-tree-selected" : ""}`}
          >
            <button
              className={"bv-tree-toggle"}
              aria-label={
                q
                  ? "Réduire les espaces de travail"
                  : "Développer les espaces de travail"
              }
              aria-expanded={q}
              onClick={() => J(!q)}
            >
              {q ? (
                <IconChevronDown size={13} />
              ) : (
                <IconChevronRight size={13} />
              )}
            </button>
            <button className={"bv-tree-label"} onClick={() => ve("/browse")}>
              <IconFolderOpen size={16} />
              <span>{"Espaces de travail"}</span>
            </button>
          </div>
          {q && (
            <div className={"bv-workspace-nodes"}>
              {ue.map((T) =>
                jsxRuntime.jsxs(
                  React.Fragment,
                  {
                    children: [
                      <div
                        className={`bv-tree-line bv-workspace-line ${be?.id === T.id && !ge ? "bv-tree-selected" : ""}`}
                      >
                        <button
                          className={"bv-tree-toggle"}
                          aria-expanded={Z.has(T.id)}
                          aria-label={`${Z.has(T.id) ? "Réduire" : "Développer"} ${T.name}`}
                          onClick={() => Xe(T.id)}
                        >
                          {Z.has(T.id) ? (
                            <IconChevronDown size={13} />
                          ) : (
                            <IconChevronRight size={13} />
                          )}
                        </button>
                        <button
                          className={"bv-tree-label"}
                          title={T.name}
                          onClick={() =>
                            ve(`/workspace/${encodeURIComponent(T.id)}`)
                          }
                        >
                          <ItemKindIcon kind={"workspace"} />
                          <span>{T.name}</span>
                        </button>
                      </div>,
                      Z.has(T.id) && (
                        <div className={"bv-folder-nodes"}>
                          {(T.folders || []).map((W) => (
                            <button
                              className={`bv-tree-line bv-folder-line ${be?.id === T.id && ge?.id === W.id ? "bv-tree-selected" : ""}`}
                              title={W.name}
                              onClick={() =>
                                ve(
                                  `/workspace/${encodeURIComponent(T.id)}/${encodeURIComponent(W.id)}`,
                                )
                              }
                              key={W.id}
                            >
                              <IconFolder size={15} />
                              <span>{W.name}</span>
                            </button>
                          ))}
                          {!T.folders?.length && (
                            <div className={"bv-no-folders"}>
                              {"Aucun dossier"}
                            </div>
                          )}
                        </div>
                      ),
                    ],
                  },
                  T.id,
                ),
              )}
            </div>
          )}
        </div>
        <div className={"bv-sidebar-footer"}>
          <button
            className={routeProp[0] === "favorites" ? "bv-active-shortcut" : ""}
            onClick={() => ve("/favorites")}
          >
            <IconStar size={15} />
            {"Favoris"}
          </button>
          <button
            className={routeProp[0] === "recents" ? "bv-active-shortcut" : ""}
            onClick={() => ve("/recents")}
          >
            <IconClock3 size={15} />
            {"Récents"}
          </button>
        </div>
      </aside>
      <div className={"bv-content"}>
        <header className={"bv-heading"}>
          <h2>{Ye}</h2>
          {ge && (
            <button
              className={"bv-parent-link"}
              onClick={() => ve(`/workspace/${encodeURIComponent(be.id)}`)}
            >
              {be.name}
            </button>
          )}
        </header>
        <div className={"bv-toolbar"}>
          <div className={"bv-menu-anchor"} data-bv-menu={true}>
            <button
              className={"bv-tool"}
              aria-haspopup={"menu"}
              aria-expanded={P?.type === "actions"}
              onClick={() =>
                ee(P?.type === "actions" ? null : { type: "actions" })
              }
            >
              {"Actions"}
              <IconChevronDown size={12} />
            </button>
            {P?.type === "actions" && (
              <div
                className={"bv-menu"}
                role={"menu"}
                aria-label={"Actions sur l’élément sélectionné"}
              >
                {ie(ne)}
              </div>
            )}
          </div>
          <div className={"bv-menu-anchor"} data-bv-menu={true}>
            <button
              className={"bv-tool"}
              aria-haspopup={"menu"}
              aria-expanded={P?.type === "create"}
              onClick={() =>
                ee(P?.type === "create" ? null : { type: "create" })
              }
            >
              {"Créer"}
              <IconChevronDown size={12} />
            </button>
            {P?.type === "create" && (
              <div
                className={"bv-menu"}
                role={"menu"}
                aria-label={"Créer un élément"}
              >
                <button
                  role={"menuitem"}
                  disabled={!Oe.workspaceId}
                  onClick={() => Y("sheet")}
                >
                  <IconFileSpreadsheet size={15} />
                  {"Feuille"}
                </button>
                <button
                  role={"menuitem"}
                  disabled={!Oe.workspaceId}
                  onClick={() => Y("dashboard")}
                >
                  <IconLayoutDashboard size={15} />
                  {"Tableau de bord"}
                </button>
                <button
                  role={"menuitem"}
                  disabled={!Oe.workspaceId}
                  onClick={() => Y("form")}
                >
                  <IconPlus size={15} />
                  {"Formulaire"}
                </button>
                <div className={"bv-menu-divider"} />
                <button
                  role={"menuitem"}
                  disabled={!Oe.workspaceId}
                  onClick={() => Y("folder")}
                >
                  <IconFolderPlus size={15} />
                  {"Dossier"}
                </button>
                <button role={"menuitem"} onClick={() => Y("workspace")}>
                  <IconUsers size={15} />
                  {"Espace de travail"}
                </button>
              </div>
            )}
          </div>
          {onImportProp && (
            <button
              className={"bv-tool bv-import"}
              onClick={() => onImportProp(Oe)}
              disabled={!Oe.workspaceId}
            >
              <IconUpload size={13} />
              {"Importer"}
            </button>
          )}
          <span className={"bv-toolbar-spacer"} />
          <label className={"bv-search"}>
            <IconSearch size={13} />
            <input
              value={k}
              onChange={(T) =>
                x(
                  (
                    T.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
              aria-label={"Filtrer les éléments"}
              placeholder={"Filtrer par nom"}
            />
            {k && (
              <button
                title={"Effacer le filtre"}
                aria-label={"Effacer le filtre"}
                onClick={() => x("")}
              >
                <IconX size={12} />
              </button>
            )}
          </label>
        </div>
        <div className={"bv-table-scroll"}>
          <table
            className={"bv-table"}
            ref={re}
            role={"grid"}
            aria-label={Ye}
            tabIndex={ne ? -1 : 0}
            onKeyDown={B}
          >
            <colgroup>
              <col className={"bv-star-col"} />
              <col className={"bv-name-col"} />
              <col className={"bv-type-col"} />
              <col className={"bv-owner-col"} />
              <col className={"bv-date-col"} />
              <col className={"bv-more-col"} />
            </colgroup>
            <thead>
              <tr>
                <th aria-label={"Favoris"}>
                  <IconStar size={12} />
                </th>
                <th
                  aria-sort={
                    N.key === "name"
                      ? N.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {te("name", "Nom")}
                </th>
                <th
                  aria-sort={
                    N.key === "type"
                      ? N.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {te("type", "Type")}
                </th>
                <th>{"Propriétaire"}</th>
                <th
                  aria-sort={
                    N.key === "date"
                      ? N.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {te("date", "Modifié")}
                </th>
                <th aria-label={"Autres actions"} />
              </tr>
            </thead>
            <tbody>
              {C.map((T) => (
                <tr
                  data-bv-row={true}
                  className={G === itemKey(T) ? "bv-row-selected" : ""}
                  aria-selected={G === itemKey(T)}
                  tabIndex={G === itemKey(T) ? 0 : -1}
                  onClick={(W) => {
                    (H(itemKey(T)), W.currentTarget.focus());
                  }}
                  onDoubleClick={() => ye(T)}
                  onContextMenu={(W) => g(W, T)}
                  key={itemKey(T)}
                >
                  <td
                    className={"bv-star-cell"}
                    onDoubleClick={(W) => W.stopPropagation()}
                  >
                    {I(T) && (
                      <button
                        title={
                          T.favorite
                            ? "Retirer des favoris"
                            : "Ajouter aux favoris"
                        }
                        aria-label={`${T.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${T.name}`}
                        className={T.favorite ? "bv-is-favorite" : ""}
                        onClick={(W) => {
                          (W.stopPropagation(), onFavoriteProp?.(T));
                        }}
                        disabled={!onFavoriteProp}
                      >
                        <IconStar
                          size={14}
                          fill={T.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      className={"bv-item-name"}
                      title={T.name}
                      onClick={(W) => {
                        (W.stopPropagation(), ye(T));
                      }}
                    >
                      <ItemKindIcon kind={T.kind} />
                      <span>{T.name}</span>
                    </button>
                  </td>
                  <td className={"bv-type-cell"}>{itemLabels[T.kind]}</td>
                  <td
                    className={"bv-owner-cell"}
                    title={`${stateProp.profile?.name || "Vous"} \xB7 Profil local`}
                  >
                    {stateProp.profile?.name || "Vous"}
                  </td>
                  <td className={"bv-date-cell"}>
                    {itemSortDate(itemDate(T))}
                  </td>
                  <td
                    className={"bv-more-cell"}
                    onDoubleClick={(W) => W.stopPropagation()}
                  >
                    <button
                      data-bv-menu={true}
                      aria-label={`Actions pour ${T.name}`}
                      title={"Actions"}
                      onClick={(W) => g(W, T)}
                    >
                      <IconEllipsis size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!C.length && (
            <div className={"bv-empty"}>
              <IconFolderOpen size={27} />
              <p>
                {k
                  ? "Aucun élément ne correspond à votre recherche."
                  : routeProp[0] === "favorites"
                    ? "Ajoutez une étoile aux éléments que vous souhaitez retrouver ici."
                    : routeProp[0] === "recents"
                      ? "Les éléments que vous ouvrez apparaîtront ici."
                      : "Ce dossier ne contient aucun élément."}
              </p>
              {k ? (
                <button onClick={() => x("")}>{"Effacer le filtre"}</button>
              ) : (
                !["favorites", "recents"].includes(routeProp[0]) && (
                  <button onClick={() => Y(ue.length ? "sheet" : "workspace")}>
                    {"Créer un élément"}
                  </button>
                )
              )}
            </div>
          )}
        </div>
        <footer className={"bv-footer"}>
          <span>
            {C.length}
            {" élément"}
            {C.length > 1 ? "s" : ""}
            {k ? ` sur ${ke.length}` : ""}
          </span>
          {ne && <span>{"1 élément sélectionné"}</span>}
        </footer>
      </div>
      {P?.type === "row" && (
        <div
          data-bv-menu={true}
          className={"bv-menu bv-context-menu"}
          role={"menu"}
          aria-label={`Actions pour ${P.item.name}`}
          style={{ left: Math.max(0, P.x), top: Math.max(0, P.y) }}
        >
          {ie(P.item)}
        </div>
      )}
    </section>
  );
}
