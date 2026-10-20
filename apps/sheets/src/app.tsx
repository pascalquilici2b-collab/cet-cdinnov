import {Loading} from '../../../platform/client/loading';
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
import { ThemeToggle } from "./theme-toggle";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  ArrowRight as IconArrowRight,
  ArrowUpRight as IconArrowUpRight,
  Bell as IconBell,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  ChevronUp as IconChevronUp,
  CircleAlert as IconCircleAlert,
  CircleHelp as IconCircleHelp,
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  Cloud as IconCloud,
  CloudUpload as IconCloudUpload,
  Copy as IconCopy,
  Download as IconDownload,
  EllipsisVertical as IconEllipsisVertical,
  FileSpreadsheet as IconFileSpreadsheet,
  FileText as IconFileText,
  Folder as IconFolder,
  Grid3x3 as IconGrid3x3,
  HardDrive as IconHardDrive,
  House as IconHouse,
  Inbox as IconInbox,
  LayoutDashboard as IconLayoutDashboard,
  Link as IconLink,
  Lock as IconLock,
  PanelLeftOpen as IconPanelLeftOpen,
  Pin as IconPin,
  Plus as IconPlus,
  Search as IconSearch,
  Star as IconStar,
  Triangle as IconTriangle,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
import { useWorkspace } from "./use-workspace";
import {
  DocumentIcon,
  IconButton,
  Modal,
  SheetSummary,
  download,
  readRoute,
} from "./shared-ui";
import {
  createSheet,
  duplicateSheet,
  exportCSV,
  importCSV,
  uuid,
} from "./workspace-domain";
import { isCloud, readSession } from "./api";
import { SheetView } from "./sheet-view";
import { DashboardView } from "./dashboard-view";
import { BrowseView } from "./browse";
import { NavigationPopover } from "./navigation";
import { CreateDialog, MoveDialog, SettingsDialog } from "./dialogs";
import { FormBuilder, FormPreview } from "./forms";
export function App() {
  const workspaceStore = useWorkspace(),
    {
      state: state,
      update: updateWorkspace,
      status: saveStatus,
      error: saveError,
      flush: flush,
    } = workspaceStore,
    [route, setRoute] = React.useState(readRoute),
    [dialog, setDialog] = React.useState(null),
    [sidebarOpen, setSidebarOpen] = React.useState(true),
    [expandedFolders, setExpandedFolders] = React.useState<
      Record<string, boolean>
    >({}),
    [notice, setNotice] = React.useState(""),
    [search, setSearch] = React.useState(""),
    [filter, setFilter] = React.useState(""),
    [createOpen, setCreateOpen] = React.useState(false),
    [collapsedSections, setCollapsedSections] = React.useState<
      Record<string, boolean>
    >({}),
    [formPreview, setFormPreview] = React.useState(null),
    [recents, setRecents] = React.useState(() => {
      try {
        return JSON.parse(localStorage.getItem("cdinnov-recents") || "[]");
      } catch {
        return [];
      }
    }),
    [navigation, setNavigation] = React.useState(null),
    [recentPage, setRecentPage] = React.useState(0),
    [quickLinks, setQuickLinks] = React.useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem("cdinnov-quick-links") || "null",
        );
      } catch {
        return null;
      }
    }),
    [sidebarWidth, setSidebarWidth] = React.useState(() =>
      Math.max(
        240,
        Math.min(
          420,
          Number(localStorage.getItem("cdinnov-sidebar-width")) || 300,
        ),
      ),
    ),
    sidebarResize = React.useRef(null),
    importTarget = React.useRef(null),
    Xe = (j, K) => {
      (setDialog(null),
        setNavigation((fe) =>
          fe?.type === j
            ? null
            : {
                type: j,
                top: K?.currentTarget?.getBoundingClientRect().top || 100,
              },
        ));
    },
    noticeTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined),
    csvInput = React.useRef<HTMLInputElement>(null),
    backupInput = React.useRef<HTMLInputElement>(null),
    submissionId = React.useRef(uuid()),
    notify = (j) => {
      (clearTimeout(noticeTimer.current),
        setNotice(j),
        (noticeTimer.current = setTimeout(() => setNotice(""), 5e3)));
    },
    navigate = (j) => {
      ((location.hash = j),
        setCreateOpen(false),
        setNavigation(null),
        setFilter(""));
    };
  if (
    (React.useEffect(() => {
      const j = () => {
        (setRoute(readRoute()), setFormPreview(null), setNavigation(null));
      };
      return (
        window.addEventListener("hashchange", j),
        () => window.removeEventListener("hashchange", j)
      );
    }, []),
    React.useEffect(() => {
      const j = (K) => {
        (K.key === "Escape" && (setCreateOpen(false), setNavigation(null)),
          (K.ctrlKey || K.metaKey) &&
            K.key === "k" &&
            (K.preventDefault(),
            setNavigation(null),
            setDialog({ type: "search" })),
          (K.ctrlKey || K.metaKey) &&
            K.key === "s" &&
            (K.preventDefault(),
            flush()
              .then(() => notify("Toutes les modifications sont enregistrées."))
              .catch(() => {})));
      };
      return (
        window.addEventListener("keydown", j),
        () => window.removeEventListener("keydown", j)
      );
    }, [flush]),
    React.useEffect(() => {
      ["sheet", "dashboard"].includes(route[0]) &&
        route[1] &&
        setRecents((j) => {
          const K = [route[1], ...j.filter((fe) => fe !== route[1])].slice(
            0,
            30,
          );
          return (
            localStorage.setItem("cdinnov-recents", JSON.stringify(K)),
            K
          );
        });
    }, [route[0], route[1]]),
    React.useEffect(() => {
      const j = state?.sheets.find((K) => K.id === route[1]);
      (j?.folderId && setExpandedFolders((K) => ({ ...K, [j.folderId]: true })),
        (document.title = `${j?.name || state?.dashboards.find((K) => K.id === route[1])?.name || "Accueil"} \xB7 CD Innovation`));
    }, [route[1], state?.sheets.length]),
    !state)
  )
    return saveStatus === "loading" ? <Loading label="Chargement de votre espace de travail…"/> : (
      <div className={"loading-screen"}>
        <div className={"brand-symbol"}>
          <IconFileSpreadsheet size={30} />
        </div>
        <h1>{"CD Innovation"}</h1>
        <p>
          {saveError}
        </p>
        <button className={"primary"} onClick={workspaceStore.reload}>
          {"Réessayer"}
        </button>
      </div>
    );
  const displayName =
      readSession()?.email?.split("@")[0].split(".").at(-1) || "Équipe",
    sheets = state.sheets,
    dashboards = state.dashboards,
    documents = [
      ...sheets.map((j) => ({ ...j, kind: "sheet" })),
      ...dashboards.map((j) => ({ ...j, kind: "dashboard" })),
    ],
    activeSheet = sheets.find((j) => j.id === route[1]),
    activeDashboard = dashboards.find((j) => j.id === route[1]),
    activeDocument =
      route[0] === "sheet"
        ? activeSheet
        : route[0] === "dashboard"
          ? activeDashboard
          : null,
    activeWorkspace = state.workspaces.find(
      (j) =>
        j.id ===
        (activeDocument?.workspaceId ||
          (route[0] === "workspace" ? route[1] : state.workspaces[0]?.id)),
    ),
    openDocument = (j) =>
      navigate(`/${j.kind || (j.rows ? "sheet" : "dashboard")}/${j.id}`),
    withActivity = (j, K) => ({
      ...j,
      activity: [
        {
          id: uuid(),
          text: K,
          createdAt: /* @__PURE__ */ new Date().toISOString(),
        },
        ...(j.activity || []),
      ].slice(0, 200),
    }),
    updateSheet = (j) =>
      updateWorkspace((K) => ({
        ...K,
        sheets: K.sheets.map((fe) =>
          fe.id === j.id
            ? { ...j, updatedAt: /* @__PURE__ */ new Date().toISOString() }
            : fe,
        ),
      })),
    ol = (j) =>
      updateWorkspace((K) => ({
        ...K,
        dashboards: K.dashboards.map((fe) => (fe.id === j.id ? j : fe)),
      })),
    Lt = (j) =>
      updateWorkspace((K) => ({
        ...K,
        [j.kind === "dashboard" ? "dashboards" : "sheets"]: K[
          j.kind === "dashboard" ? "dashboards" : "sheets"
        ].map((fe) =>
          fe.id === j.id ? { ...fe, favorite: !fe.favorite } : fe,
        ),
      })),
    downloadBackup = () =>
      download(
        `cdinnov-sauvegarde-${/* @__PURE__ */ new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(workspaceStore.current.current, null, 2),
        "application/json",
      ),
    Ll =
      saveStatus === "saved"
        ? "Enregistré en ligne"
        : saveStatus === "saving" || saveStatus === "pending"
          ? "Enregistrement…"
          : "Sauvegarde interrompue",
    Et = (j = "sheet", K = {}) => {
      (setNavigation(null), setDialog({ type: "create", kind: j, ...K }));
    },
    Zt = (quickLinks || documents.map((j) => j.id)).filter((j) =>
      documents.some((K) => K.id === j),
    ),
    Ke = Zt.map((j) => documents.find((K) => K.id === j)),
    fn = (j) => {
      const K = Zt.includes(j.id)
        ? Zt.filter((fe) => fe !== j.id)
        : [...Zt, j.id];
      (setQuickLinks(K),
        setRecentPage(0),
        localStorage.setItem("cdinnov-quick-links", JSON.stringify(K)));
    },
    ca = (j) => {
      if (j.kind === "sheet" || j.rows) {
        const K = duplicateSheet(j);
        (delete K.kind,
          updateWorkspace((fe) => ({ ...fe, sheets: [...fe.sheets, K] })),
          navigate(`/sheet/${K.id}`));
      } else {
        const K = {
          ...structuredClone(j),
          id: uuid(),
          name: `${j.name} \u2014 copie`,
        };
        (delete K.kind,
          updateWorkspace((fe) => ({
            ...fe,
            dashboards: [...fe.dashboards, K],
          })),
          navigate(`/dashboard/${K.id}`));
      }
    },
    chooseCSV = (j) => {
      ((importTarget.current = j),
        setNavigation(null),
        csvInput.current.click());
    },
    formSheet = formPreview
      ? sheets.find((j) => j.id === formPreview.sheetId)
      : route[0] === "form"
        ? sheets.find((j) => j.id === route[1])
        : null,
    activeForm =
      formPreview?.form || formSheet?.forms.find((j) => j.id === route[2]),
    submitForm = async (j) => {
      const K = submissionId.current;
      (updateWorkspace((fe) =>
        withActivity(
          {
            ...fe,
            sheets: fe.sheets.map((bt) =>
              bt.id === formSheet.id
                ? {
                    ...bt,
                    updatedAt: /* @__PURE__ */ new Date().toISOString(),
                    rows: [
                      ...bt.rows.filter((jt) => jt.id !== K),
                      { id: K, parentId: null, cells: j },
                    ],
                  }
                : bt,
            ),
          },
          `R\xE9ponse re\xE7ue : ${activeForm.title}`,
        ),
      ),
        await flush(),
        (submissionId.current = uuid()));
    },
    importCSVFile = async (j) => {
      const K = j.target.files?.[0];
      if (
        (((
          j.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        ).value = ""),
        !!K)
      )
        try {
          if (K.size > 5 * 1024 * 1024)
            throw new Error("Le fichier doit faire moins de 5 Mo.");
          const fe = importCSV(
            await K.text(),
            K.name.replace(/\.csv$/i, ""),
            importTarget.current?.workspaceId ||
              activeWorkspace?.id ||
              state.workspaces[0].id,
          );
          ((fe.folderId = importTarget.current?.folderId || null),
            (importTarget.current = null),
            updateWorkspace((bt) =>
              withActivity(
                { ...bt, sheets: [...bt.sheets, fe] },
                `Feuille import\xE9e : ${fe.name}`,
              ),
            ),
            await flush(),
            navigate(`/sheet/${fe.id}`),
            notify(`${fe.rows.length} lignes import\xE9es.`));
        } catch (fe) {
          notify(fe.message);
        }
    },
    readBackup = async (j) => {
      const K = j.target.files?.[0];
      if (
        (((
          j.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        ).value = ""),
        !!K)
      )
        try {
          if (K.size > 10 * 1024 * 1024)
            throw new Error("Fichier limité à 10 Mo.");
          const fe = JSON.parse(await K.text());
          if (
            fe.version !== 1 ||
            !Array.isArray(fe.sheets) ||
            !Array.isArray(fe.workspaces) ||
            !Array.isArray(fe.dashboards)
          )
            throw new Error("Ce fichier n’est pas une sauvegarde compatible.");
          setDialog({ type: "restore-confirm", next: fe });
        } catch (fe) {
          notify(fe.message);
        }
    };
  documents
    .filter((j) =>
      route[0] === "favorites"
        ? j.favorite
        : route[0] === "recents"
          ? recents.includes(j.id)
          : route[0] === "workspace"
            ? j.workspaceId === route[1]
            : true,
    )
    .filter((j) =>
      j.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    )
    .sort((j, K) =>
      route[0] === "recents"
        ? recents.indexOf(j.id) - recents.indexOf(K.id)
        : j.name.localeCompare(K.name, "fr"),
    );
  const $l = documents
      .filter(
        (j) =>
          j.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
          (j.rows || []).some((K) =>
            Object.values(K.cells).some((fe) =>
              String(fe)
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            ),
          ),
      )
      .slice(0, 30),
    closeDialog = () => setDialog(null),
    fl = activeWorkspace
      ? documents.filter((j) => j.workspaceId === activeWorkspace.id)
      : [],
    createDocument = ({ kind: j, name: K, workspaceId: fe, folderId: bt }) => {
      if (j === "workspace") {
        const jt = { id: uuid(), name: K, folders: [] };
        (updateWorkspace((at) =>
          withActivity(
            { ...at, workspaces: [...at.workspaces, jt] },
            `Espace de travail cr\xE9\xE9 : ${K}`,
          ),
        ),
          navigate(`/workspace/${jt.id}`));
      } else if (j === "folder")
        (updateWorkspace((jt) => ({
          ...jt,
          workspaces: jt.workspaces.map((at) =>
            at.id === fe
              ? { ...at, folders: [...at.folders, { id: uuid(), name: K }] }
              : at,
          ),
        })),
          navigate(`/workspace/${fe}`));
      else if (j === "dashboard") {
        const jt = {
          id: uuid(),
          name: K,
          workspaceId: fe,
          sheetIds: sheets
            .filter((at) => at.workspaceId === fe)
            .map((at) => at.id),
          favorite: false,
          widgets: [],
        };
        (updateWorkspace((at) =>
          withActivity(
            { ...at, dashboards: [...at.dashboards, jt] },
            `Tableau de bord cr\xE9\xE9 : ${K}`,
          ),
        ),
          navigate(`/dashboard/${jt.id}`));
      } else {
        const jt = createSheet(K, fe);
        if (
          ((jt.folderId = bt || null),
          updateWorkspace((at) =>
            withActivity(
              { ...at, sheets: [...at.sheets, jt] },
              `Feuille cr\xE9\xE9e : ${K}`,
            ),
          ),
          navigate(`/sheet/${jt.id}`),
          j === "form")
        ) {
          setDialog({ type: "forms", sheetId: jt.id });
          return;
        }
      }
      (closeDialog(), notify("Votre nouvel élément est prêt."));
    },
    Tt = (j) => (
      <article className={"quick-card"} key={j.id}>
        <button className={"quick-open"} onClick={() => openDocument(j)}>
          <span className={"quick-title"}>
            <DocumentIcon kind={j.kind} />
            <b>{j.name}</b>
          </span>
          <span className={"quick-workspace"}>
            <IconUsers size={13} />
            {state.workspaces.find((K) => K.id === j.workspaceId)?.name ||
              "Espace de travail"}
          </span>
        </button>
        <IconButton
          label={`D\xE9s\xE9pingler : ${j.name}`}
          className={"pin"}
          onClick={() => fn(j)}
        >
          <IconPin size={14} />
        </IconButton>
      </article>
    );
  return (
    <div
      className={"app-shell"}
      style={{ "--workspace-width": `${sidebarWidth}px` }}
    >
      <input
        type={"file"}
        accept={".csv,text/csv"}
        hidden={true}
        ref={csvInput}
        onChange={importCSVFile}
      />
      <input
        type={"file"}
        accept={".json,application/json"}
        hidden={true}
        ref={backupInput}
        onChange={readBackup}
      />
      <nav className={"rail"} aria-label={"Navigation principale"}>
        <button
          className={`rail-create ${navigation?.type === "create" ? "active" : ""}`}
          aria-expanded={navigation?.type === "create"}
          onClick={(j) => Xe("create", j)}
        >
          <span>
            <IconPlus size={22} />
          </span>
          {"Créer"}
        </button>
        <div className={"rail-rule"} />
        {[
          ["home", "Accueil", IconHouse, () => navigate("/home")] as const,
          [
            "activity",
            "Notifications",
            IconBell,
            (j) => Xe("activity", j),
          ] as const,
          [
            "search",
            "Recherche",
            IconSearch,
            () => {
              (setSearch(""), setDialog({ type: "search" }));
            },
          ] as const,
          [
            "browse",
            "Parcourir",
            IconFolder,
            () => navigate("/browse"),
          ] as const,
          ["recents", "Récents", IconClock, (j) => Xe("recents", j)] as const,
          [
            "favorites",
            "Favoris",
            IconStar,
            (j) => Xe("favorites", j),
          ] as const,
        ].map(([j, K, fe, bt]) => (
          <button
            className={`rail-item ${navigation?.type === j || (!navigation && route[0] === j) ? "active" : ""}`}
            aria-current={!navigation && route[0] === j ? "page" : void 0}
            aria-expanded={
              ["recents", "favorites", "activity"].includes(j)
                ? navigation?.type === j
                : void 0
            }
            onClick={bt}
            key={j}
          >
            <span>
              {jsxRuntime.jsx(fe, {
                size: 19,
                fill: [
                  "home",
                  "activity",
                  "search",
                  "browse",
                  "recents",
                  "favorites",
                ].includes(j)
                  ? "currentColor"
                  : "none",
              })}
            </span>
            {K}
          </button>
        ))}
        {activeDocument && (
          <React.Fragment>
            <div className={"rail-rule"} />
            <button
              className={`rail-item ${sidebarOpen ? "active" : ""}`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <span>
                <IconUsers size={19} />
              </span>
              {"Espace de travail"}
            </button>
          </React.Fragment>
        )}
        <div className={"rail-bottom"}>
          <ThemeToggle />
          <IconButton
            label={"Mes applications"}
            onClick={() => setDialog({ type: "apps" })}
          >
            <IconGrid3x3 size={19} />
          </IconButton>
          <IconButton
            label={"Aide"}
            onClick={() => setDialog({ type: "help" })}
          >
            <IconCircleHelp size={18} />
          </IconButton>
          <button
            className={"avatar"}
            title={"Compte et sauvegardes"}
            onClick={() => setDialog({ type: "settings" })}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </nav>
      {activeDocument && sidebarOpen && (
        <aside className={"workspace-sidebar"} aria-label={"Espace de travail"}>
          <div className={"workspace-brand"}>
            <button className={"brand"} onClick={() => navigate("/home")}>
              <IconTriangle size={29} />
              <span>
                {"cdi"}
                <small>
                  {"développement"}
                  <br />
                  {"innovation"}
                </small>
              </span>
            </button>
            <IconButton
              label={"Fermer le panneau Espace de travail"}
              onClick={() => setSidebarOpen(false)}
            >
              <IconX size={17} />
            </IconButton>
          </div>
          <button
            className={"workspace-name"}
            onClick={() => navigate(`/workspace/${activeWorkspace?.id}`)}
          >
            {activeWorkspace?.name}
          </button>
          <button
            className={"primary compact workspace-add"}
            onClick={() => Et()}
          >
            <IconPlus size={16} />
            {"Ajouter à l’espace de travail"}
          </button>
          <div className={"workspace-tree"}>
            <button
              className={"tree-section"}
              aria-expanded={!expandedFolders.__rootCollapsed}
              onClick={() =>
                setExpandedFolders({
                  ...expandedFolders,
                  __rootCollapsed: !expandedFolders.__rootCollapsed,
                })
              }
            >
              {expandedFolders.__rootCollapsed ? (
                <IconChevronRight size={13} />
              ) : (
                <IconChevronDown size={13} />
              )}
              <IconFolder size={16} />
              {"Éléments de l’espace de travail"}
            </button>
            {!expandedFolders.__rootCollapsed &&
              (activeWorkspace?.folders || []).map((j) => (
                <div key={j.id}>
                  <button
                    className={"tree-folder"}
                    aria-expanded={!!expandedFolders[j.id]}
                    onClick={() =>
                      setExpandedFolders({
                        ...expandedFolders,
                        [j.id]: !expandedFolders[j.id],
                      })
                    }
                  >
                    {expandedFolders[j.id] ? (
                      <IconChevronDown size={13} />
                    ) : (
                      <IconChevronRight size={13} />
                    )}
                    <IconFolder size={16} />
                    <span>{j.name}</span>
                  </button>
                  {expandedFolders[j.id] && (
                    <div className={"folder-children"}>
                      {fl
                        .filter((K) => K.folderId === j.id)
                        .map((K) => (
                          <button
                            className={`tree-leaf ${activeDocument.id === K.id ? "selected" : ""}`}
                            onClick={() => openDocument(K)}
                            key={K.id}
                          >
                            <DocumentIcon kind={K.kind} size={14} />
                            <span>{K.name}</span>
                          </button>
                        ))}
                      {!fl.some((K) => K.folderId === j.id) && (
                        <span className={"empty-folder"}>
                          {"Ce dossier est vide"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            {!expandedFolders.__rootCollapsed &&
              fl
                .filter((j) => !j.folderId)
                .map((j) => (
                  <button
                    className={`tree-leaf ${activeDocument.id === j.id ? "selected" : ""}`}
                    title={j.name}
                    onClick={() => openDocument(j)}
                    key={j.id}
                  >
                    <DocumentIcon kind={j.kind} size={14} />
                    <span>{j.name}</span>
                  </button>
                ))}
          </div>
          <button className={"sidebar-all"} onClick={() => navigate("/browse")}>
            <IconFolder size={15} />
            {"Tous les espaces"}
            <IconArrowUpRight size={14} />
          </button>
          <div
            className={"sidebar-resizer"}
            role={"separator"}
            aria-label={"Largeur de l’espace de travail"}
            aria-orientation={"vertical"}
            aria-valuemin={240}
            aria-valuemax={420}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={(j) => {
              ((sidebarResize.current = { x: j.clientX, width: sidebarWidth }),
                j.currentTarget.setPointerCapture(j.pointerId));
            }}
            onPointerMove={(j) => {
              if (!sidebarResize.current) return;
              const K = Math.max(
                240,
                Math.min(
                  420,
                  sidebarResize.current.width +
                    j.clientX -
                    sidebarResize.current.x,
                ),
              );
              setSidebarWidth(K);
            }}
            onPointerUp={() => {
              ((sidebarResize.current = null),
                localStorage.setItem(
                  "cdinnov-sidebar-width",
                  String(sidebarWidth),
                ));
            }}
            onPointerCancel={() => {
              sidebarResize.current = null;
            }}
            onKeyDown={(j) => {
              if (j.key === "ArrowLeft" || j.key === "ArrowRight") {
                j.preventDefault();
                const K = Math.max(
                  240,
                  Math.min(
                    420,
                    sidebarWidth + (j.key === "ArrowRight" ? 8 : -8),
                  ),
                );
                (setSidebarWidth(K),
                  localStorage.setItem("cdinnov-sidebar-width", String(K)));
              }
            }}
          />
        </aside>
      )}
      <main className={`main ${route[0] === "home" ? "home-main" : ""}`}>
        {saveError && (
          <div className={"save-error"} role={"alert"}>
            <IconCircleAlert size={17} />
            <span>{saveError}</span>
            <button onClick={downloadBackup}>{"Exporter ma copie"}</button>
            {saveStatus === "conflict" ? (
              <button onClick={() => setDialog({ type: "reload-confirm" })}>
                {"Recharger"}
              </button>
            ) : (
              <button onClick={() => flush().catch(() => {})}>
                {"Réessayer"}
              </button>
            )}
          </div>
        )}
        {activeDocument ? (
          <React.Fragment>
            <header className={"document-header"}>
              {!sidebarOpen && (
                <IconButton
                  label={"Afficher le panneau Espace de travail"}
                  onClick={() => setSidebarOpen(true)}
                >
                  <IconPanelLeftOpen size={19} />
                </IconButton>
              )}
              <DocumentIcon kind={route[0]} />
              <SheetSummary
                item={activeDocument}
                onChange={route[0] === "sheet" ? updateSheet : ol}
                key={activeDocument.id}
              />
              <div className={"file-menu-wrap"}>
                <IconButton
                  label={"Menu Fichier"}
                  onClick={() => setCreateOpen(!createOpen)}
                >
                  <IconEllipsisVertical size={19} />
                </IconButton>
                {createOpen && (
                  <React.Fragment>
                    <button
                      className={"menu-dismiss"}
                      aria-label={"Fermer le menu Fichier"}
                      onClick={() => setCreateOpen(false)}
                    />
                    <div className={"file-menu"}>
                      <button
                        onClick={() => {
                          if (activeSheet) {
                            const j = duplicateSheet(activeSheet);
                            (updateWorkspace((K) => ({
                              ...K,
                              sheets: [...K.sheets, j],
                            })),
                              navigate(`/sheet/${j.id}`));
                          } else {
                            const j = {
                              ...structuredClone(activeDashboard),
                              id: uuid(),
                              name: `${activeDashboard.name} \u2014 copie`,
                            };
                            (updateWorkspace((K) => ({
                              ...K,
                              dashboards: [...K.dashboards, j],
                            })),
                              navigate(`/dashboard/${j.id}`));
                          }
                        }}
                      >
                        <IconCopy size={16} />
                        {"Enregistrer une copie"}
                      </button>
                      {activeSheet && (
                        <button
                          onClick={() => {
                            (download(
                              `${activeSheet.name}.csv`,
                              exportCSV(activeSheet),
                              "text/csv;charset=utf-8",
                            ),
                              setCreateOpen(false));
                          }}
                        >
                          <IconDownload size={16} />
                          {"Exporter au format CSV"}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          (setDialog({
                            type: "move",
                            item: activeDocument,
                            kind: route[0],
                          }),
                            setCreateOpen(false));
                        }}
                      >
                        <IconFolder size={16} />
                        {"Déplacer vers…"}
                      </button>
                      <button
                        onClick={() => {
                          (downloadBackup(), setCreateOpen(false));
                        }}
                      >
                        <IconHardDrive size={16} />
                        {"Sauvegarder tous les espaces"}
                      </button>
                    </div>
                  </React.Fragment>
                )}
              </div>
              <IconButton
                label={
                  activeDocument.favorite
                    ? "Retirer des favoris"
                    : "Ajouter aux favoris"
                }
                onClick={() => Lt({ ...activeDocument, kind: route[0] })}
              >
                <IconStar
                  size={19}
                  fill={activeDocument.favorite ? "#d7a64a" : "none"}
                />
              </IconButton>
              <span className={`save-state ${saveStatus}`} title={Ll}>
                {saveStatus === "saved" ? (
                  <IconCloud size={18} />
                ) : saveStatus === "pending" || saveStatus === "saving" ? (
                  <IconCloudUpload size={18} />
                ) : (
                  <IconCircleAlert size={18} />
                )}
                <span>{Ll}</span>
              </span>
              <IconButton
                label={"Aide et commentaires"}
                onClick={() => setDialog({ type: "help" })}
              >
                <IconCircleHelp size={18} />
              </IconButton>
              <div className={"header-spacer"} />
              <button
                className={"primary compact share-button"}
                onClick={() =>
                  setDialog({ type: "share", item: activeDocument })
                }
              >
                <IconLock size={15} />
                {"Partager"}
                <IconChevronDown size={14} />
              </button>
            </header>
            {route[0] === "sheet" ? (
              <SheetView
                sheet={activeSheet}
                saveStatus={saveStatus}
                saveError={saveError}
                onChange={updateSheet}
                onNotice={notify}
                onOpenForms={() =>
                  setDialog({ type: "forms", sheetId: activeSheet.id })
                }
                key={activeSheet.id}
              />
            ) : (
              <DashboardView
                dashboard={activeDashboard}
                sheets={sheets}
                onChange={ol}
                onOpenSheet={(j) =>
                  navigate(`/sheet/${typeof j == "string" ? j : j.id}`)
                }
                key={activeDashboard.id}
              />
            )}
          </React.Fragment>
        ) : route[0] === "home" ? (
          <div className={"home-scroll"}>
            <div className={"home-help"}>
              <a className={"cloud-portal-link"} href={"/"}>
                <IconChevronLeft size={16} />
                {"Portail CDInnov"}
              </a>
              <button
                className={"outline compact"}
                onClick={() => setDialog({ type: "help" })}
              >
                <IconCircleHelp size={15} />
                {"Aide et commentaires"}
              </button>
            </div>
            <section className={"home-hero"}>
              <h1>
                {"Bon retour, "}
                <span>{displayName}</span>
              </h1>
              <p>
                {
                  "Vos projets, vos équipes et vos idées, réunis dans un seul espace."
                }
              </p>
              <button
                className={"home-search"}
                onClick={() => {
                  (setSearch(""), setDialog({ type: "search" }));
                }}
              >
                <span>
                  {"Rechercher une feuille, un tableau de bord ou une tâche"}
                </span>
                <div>
                  <IconSearch size={18} />
                  <kbd>{"Ctrl K"}</kbd>
                  <IconArrowRight size={20} />
                </div>
              </button>
              <div className={"hero-actions"}>
                <button onClick={() => Et("workspace")}>
                  <IconPlus size={15} />
                  {"Créer un espace de travail"}
                </button>
                <button onClick={() => setDialog({ type: "help" })}>
                  <IconCircleHelp size={14} />
                  {"Que puis-je faire ici ?"}
                </button>
              </div>
              <p className={"home-note"}>
                {state.sampleData
                  ? "Données de démonstration · les noms des projets reprennent votre environnement Smartsheet."
                  : "Espace partagé CDInnov · modifications enregistrées en ligne."}
              </p>
            </section>
            <section className={"home-panel quick-panel"}>
              <div className={"panel-heading"}>
                <button
                  onClick={() =>
                    setCollapsedSections({
                      ...collapsedSections,
                      quick: !collapsedSections.quick,
                    })
                  }
                >
                  {collapsedSections.quick ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronUp size={14} />
                  )}
                  <h2>{"Liens rapides"}</h2>
                  <IconCircleHelp size={14} />
                </button>
                <div className={"quick-actions"}>
                  <IconButton
                    label={"Page précédente des liens rapides"}
                    disabled={recentPage === 0}
                    onClick={() => setRecentPage(Math.max(0, recentPage - 1))}
                  >
                    <IconChevronLeft size={16} />
                  </IconButton>
                  <IconButton
                    label={"Page suivante des liens rapides"}
                    disabled={(recentPage + 1) * 15 >= Ke.length}
                    onClick={() => setRecentPage(recentPage + 1)}
                  >
                    <IconChevronRight size={16} />
                  </IconButton>
                  <button
                    className={"outline compact"}
                    onClick={() => {
                      (setSearch(""), setDialog({ type: "pin" }));
                    }}
                  >
                    <IconPlus size={15} />
                    {"Épingler l’élément"}
                  </button>
                </div>
              </div>
              {!collapsedSections.quick && (
                <div className={"quick-grid"}>
                  {Ke.slice(recentPage * 15, recentPage * 15 + 15).map(Tt)}
                  {!Ke.length && (
                    <div className={"quick-empty"}>
                      <IconPin size={22} />
                      <span>
                        {
                          "Épinglez vos feuilles et tableaux de bord pour y accéder rapidement."
                        }
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>
            <section className={"home-panel mentions-panel"}>
              <div className={"panel-heading"}>
                <button
                  onClick={() =>
                    setCollapsedSections({
                      ...collapsedSections,
                      mentions: !collapsedSections.mentions,
                    })
                  }
                >
                  {collapsedSections.mentions ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronUp size={14} />
                  )}
                  <h2>{"Mentions"}</h2>
                </button>
                <button
                  className={"text-button"}
                  onClick={(j) => Xe("activity", j)}
                >
                  {"Ouvrir les notifications"}
                </button>
              </div>
              {!collapsedSections.mentions && (
                <div className={"empty-mentions"}>
                  <div className={"mail-illustration"}>
                    <IconInbox size={47} />
                    <span>
                      <IconCheck size={16} />
                    </span>
                  </div>
                  <strong>{"Vous êtes à jour !"}</strong>
                  <p>
                    {
                      "Consultez les commentaires des lignes pour suivre les échanges sur votre travail."
                    }
                  </p>
                  <button
                    className={"text-button"}
                    onClick={() => navigate("/recents")}
                  >
                    {"Ouvrir mes éléments récents"}
                  </button>
                </div>
              )}
            </section>
            <section className={"home-panel"}>
              <div className={"panel-heading"}>
                <button
                  onClick={() =>
                    setCollapsedSections({
                      ...collapsedSections,
                      spaces: !collapsedSections.spaces,
                    })
                  }
                >
                  {collapsedSections.spaces ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronUp size={14} />
                  )}
                  <h2>{"Vos espaces de travail"}</h2>
                </button>
                <button
                  className={"text-button"}
                  onClick={() => navigate("/browse")}
                >
                  {"Tout afficher"}
                  <IconArrowRight size={14} />
                </button>
              </div>
              {!collapsedSections.spaces && (
                <div className={"spaces-grid"}>
                  {state.workspaces.map((j, K) => (
                    <button
                      className={"workspace-card"}
                      onClick={() => navigate(`/workspace/${j.id}`)}
                      key={j.id}
                    >
                      <span className={`space-art art-${K % 4}`}>
                        <IconUsers size={25} />
                        <span />
                        <span />
                      </span>
                      <strong>{j.name}</strong>
                      <small>
                        {
                          documents.filter((fe) => fe.workspaceId === j.id)
                            .length
                        }
                        {" éléments"}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <footer className={"home-footer"}>
              <span>
                {"CD Innovation · "}
                {"Espace partagé"}
              </span>
              <span>
                <IconHardDrive size={13} />
                {"Sauvegarde automatique en ligne"}
              </span>
            </footer>
          </div>
        ) : ["browse", "workspace", "favorites", "recents"].includes(
            route[0],
          ) ? (
          <BrowseView
            state={state}
            route={route}
            recents={recents}
            onNavigate={navigate}
            onOpenItem={openDocument}
            onFavorite={Lt}
            onCreate={Et}
            onImport={chooseCSV}
            onMove={(j) =>
              setDialog({
                type: "move",
                item: (j.kind === "sheet" ? sheets : dashboards).find(
                  (K) => K.id === j.id,
                ),
                kind: j.kind,
              })
            }
            onDuplicate={ca}
          />
        ) : route[0] === "form" && activeForm ? (
          <div />
        ) : (
          <div className={"empty-state"}>
            <IconFileText size={40} />
            <h2>{"Élément introuvable"}</h2>
            <button className={"primary"} onClick={() => navigate("/home")}>
              {"Retour à l’accueil"}
            </button>
          </div>
        )}
      </main>
      {navigation && (
        <NavigationPopover
          {...navigation}
          items={documents}
          recents={recents}
          activity={state.activity || []}
          workspaces={state.workspaces}
          onClose={() => setNavigation(null)}
          onOpen={openDocument}
          onFavorite={Lt}
          onCreate={Et}
          onImport={() => chooseCSV({ workspaceId: activeWorkspace?.id })}
          onNavigate={navigate}
        />
      )}
      {notice && (
        <div className={"toast"} role={"status"}>
          <IconCheck size={18} />
          <span>{notice}</span>
          <IconButton
            label={"Fermer la notification"}
            onClick={() => setNotice("")}
          >
            <IconX size={15} />
          </IconButton>
        </div>
      )}
      {dialog?.type === "create" && (
        <CreateDialog
          initial={dialog.kind}
          workspaces={state.workspaces}
          workspaceId={dialog.workspaceId || activeWorkspace?.id}
          initialFolderId={dialog.folderId || ""}
          onClose={closeDialog}
          onCreate={createDocument}
        />
      )}
      {["search", "pin"].includes(dialog?.type) && (
        <Modal
          title={
            dialog.type === "pin"
              ? "Épingler un élément"
              : "Rechercher dans votre espace"
          }
          onClose={closeDialog}
          wide={true}
        >
          <div className={"modal-body"}>
            <div className={"global-search"}>
              <IconSearch size={20} />
              <input
                autoFocus={true}
                aria-label={"Rechercher"}
                placeholder={"Nom d’un élément ou contenu d’une tâche…"}
                value={search}
                onChange={(j) =>
                  setSearch(
                    (
                      j.target as
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement
                    ).value,
                  )
                }
              />
              <kbd>{"Ctrl K"}</kbd>
            </div>
            <p className={"muted small"}>
              {$l.length}
              {" résultat"}
              {$l.length > 1 ? "s" : ""}
              {" · recherche dans les feuilles"}
            </p>
            <div className={"search-results"}>
              {$l.map((j) => (
                <button
                  aria-pressed={
                    dialog.type === "pin" ? Zt.includes(j.id) : void 0
                  }
                  onClick={() => {
                    dialog.type === "pin"
                      ? (fn(j),
                        notify(
                          Zt.includes(j.id)
                            ? "Élément retiré des liens rapides."
                            : "Élément épinglé dans les liens rapides.",
                        ))
                      : (openDocument(j), closeDialog());
                  }}
                  key={j.id}
                >
                  <DocumentIcon kind={j.kind} />
                  <span>
                    <b>{j.name}</b>
                    <small>
                      {
                        state.workspaces.find((K) => K.id === j.workspaceId)
                          ?.name
                      }
                    </small>
                  </span>
                  {dialog.type === "pin" ? (
                    <IconPin
                      size={18}
                      fill={Zt.includes(j.id) ? "#dce5fc" : "none"}
                      color={Zt.includes(j.id) ? "#3569cb" : "currentColor"}
                    />
                  ) : (
                    <IconArrowUpRight size={16} />
                  )}
                </button>
              ))}
              {!$l.length && (
                <div className={"empty-state"}>
                  <IconSearch size={30} />
                  <p>{"Aucun élément ne correspond à votre recherche."}</p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {dialog?.type === "activity" && (
        <Modal title={"Notifications et activité"} onClose={closeDialog}>
          <div className={"modal-body"}>
            <p className={"muted"}>
              {"Les événements enregistrés dans votre espace de travail."}
            </p>
            <div className={"activity-list"}>
              {(state.activity || []).map((j) => (
                <div key={j.id}>
                  <span className={"activity-dot"}>
                    <IconCheck size={16} />
                  </span>
                  <div>
                    <p>{j.text}</p>
                    <small>
                      {new Date(j.createdAt).toLocaleString("fr-FR")}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {!state.activity?.length && (
              <div className={"empty-state"}>
                <IconBell size={35} />
                <p>{"Aucune notification pour l’instant."}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {dialog?.type === "share" && (
        <Modal title={"Partager"} onClose={closeDialog}>
          <div className={"modal-body share-body"}>
            <h3>{dialog.item.name}</h3>
            <p>{"Accès partagé avec les comptes CDInnov autorisés"}</p>
            <div className={"share-person"}>
              <span className={"avatar"}>{displayName.slice(0, 1)}</span>
              <div>
                <b>{displayName}</b>
                <small>{"Compte CDInnov"}</small>
              </div>
              <span>{"Éditeur"}</span>
            </div>
            <div className={"share-link-row"}>
              <IconLink size={17} />
              <input
                aria-label={"Lien de l’élément"}
                readOnly={true}
                value={location.href}
              />
              <button
                className={"outline compact"}
                onClick={async () => {
                  try {
                    (await navigator.clipboard.writeText(location.href),
                      notify(isCloud ? "Lien copié." : "Lien local copié."));
                  } catch {
                    notify("Sélectionnez le lien pour le copier.");
                  }
                }}
              >
                {"Copier le lien"}
              </button>
            </div>
            <p className={"share-local-note"}>
              <IconLock size={15} />
              {
                "Une connexion CDInnov est requise. Les comptes autorisés consultent et modifient cet espace commun."
              }
            </p>
            <div className={"modal-actions"}>
              <button
                className={"outline"}
                onClick={() => {
                  activeSheet
                    ? download(
                        activeSheet.name + ".csv",
                        exportCSV(activeSheet),
                        "text/csv;charset=utf-8",
                      )
                    : downloadBackup();
                }}
              >
                <IconDownload size={15} />
                {"Exporter une copie"}
              </button>
              <button className={"primary"} onClick={closeDialog}>
                {"Terminé"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.type === "settings" && (
        <SettingsDialog
          state={state}
          update={updateWorkspace}
          onClose={closeDialog}
          onBackup={downloadBackup}
          onImport={() => {
            (closeDialog(), backupInput.current.click());
          }}
          onCSV={() => {
            (closeDialog(), csvInput.current.click());
          }}
        />
      )}
      {dialog?.type === "help" && (
        <Modal
          title={"Votre espace de travail"}
          onClose={closeDialog}
          wide={true}
        >
          <div className={"modal-body help-body"}>
            <div className={"help-lead"}>
              <span className={"brand-symbol"}>
                <IconFileSpreadsheet size={25} />
              </span>
              <div>
                <h3>{"CD Innovation · Feuilles"}</h3>
                <p>{"Votre espace de travail partagé CDInnov."}</p>
              </div>
            </div>
            <div className={"help-grid"}>
              <section>
                <h4>{"Feuilles et vues"}</h4>
                <p>
                  {
                    "Modifiez les cellules, ajoutez des lignes et des colonnes, puis passez de la table au Gantt, aux cartes ou à l’agenda."
                  }
                </p>
              </section>
              <section>
                <h4>{"Formulaires"}</h4>
                <p>
                  {
                    "Créez un formulaire depuis une feuille. Chaque réponse ajoute une ligne à cette feuille. "
                  }
                  {"Les liens nécessitent une connexion CDInnov."}
                </p>
              </section>
              <section>
                <h4>{"Tableaux de bord"}</h4>
                <p>
                  {
                    "Choisissez les feuilles sources pour calculer vos indicateurs et organiser vos widgets."
                  }
                </p>
              </section>
              <section>
                <h4>{"Sauvegarde"}</h4>
                <p>
                  {
                    "Les modifications sont enregistrées en ligne et partagées avec votre équipe."
                  }
                  {
                    " Exportez une sauvegarde JSON pour conserver une copie complète, ou un CSV pour une feuille."
                  }
                </p>
              </section>
            </div>
            <div className={"info-box"}>
              <IconCircleHelp size={19} />
              <p>
                {
                  "Cette version ne se connecte pas aux services Smartsheet. Smart Assist, collaboration en temps réel, permissions, notifications par e-mail et connecteurs externes ne sont pas implémentés. Les données initiales sont des exemples."
                }
              </p>
            </div>
            <div className={"keyboard-list"}>
              <span>
                <kbd>{"Ctrl K"}</kbd>
                {"Rechercher"}
              </span>
              <span>
                <kbd>{"Ctrl S"}</kbd>
                {"Enregistrer"}
              </span>
              <span>
                <kbd>{"Échap"}</kbd>
                {"Fermer une fenêtre"}
              </span>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.type === "apps" && (
        <Modal title={"Vos outils de travail"} onClose={closeDialog}>
          <div className={"modal-body app-picker"}>
            {[
              ["sheet", "Feuille", IconFileSpreadsheet] as const,
              ["dashboard", "Tableau de bord", IconLayoutDashboard] as const,
              ["form", "Formulaire", IconClipboardList] as const,
              ["workspace", "Espace de travail", IconUsers] as const,
            ].map(([j, K, fe]) => (
              <button onClick={() => Et(j)} key={j}>
                {jsxRuntime.jsx(fe, { size: 28 })}
                <strong>{K}</strong>
                <span>
                  {"Créer"}
                  <IconPlus size={14} />
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog?.type === "move" && (
        <MoveDialog
          item={dialog.item}
          workspaces={state.workspaces}
          onClose={closeDialog}
          onSave={(j, K) => {
            (dialog.kind === "sheet"
              ? updateSheet({ ...dialog.item, workspaceId: j, folderId: K })
              : ol({ ...dialog.item, workspaceId: j }),
              closeDialog(),
              notify("Élément déplacé."));
          }}
        />
      )}
      {dialog?.type === "forms" &&
        sheets.find((j) => j.id === dialog.sheetId) && (
          <FormBuilder
            sheet={sheets.find((j) => j.id === dialog.sheetId)}
            onChange={updateSheet}
            onClose={closeDialog}
            onPreview={(j) => {
              ((submissionId.current = uuid()),
                setFormPreview({ sheetId: dialog.sheetId, form: j }));
            }}
          />
        )}
      {(formPreview || route[0] === "form") && activeForm && (
        <FormPreview
          sheet={formSheet}
          form={activeForm}
          onSubmit={submitForm}
          onClose={() => {
            (setFormPreview(null),
              route[0] === "form" && navigate(`/sheet/${formSheet.id}`));
          }}
        />
      )}
      {dialog?.type === "restore-confirm" && (
        <Modal title={"Restaurer une sauvegarde"} onClose={closeDialog}>
          <div className={"modal-body"}>
            <p>
              {"La sauvegarde contient "}
              <b>
                {dialog.next.sheets.length}
                {" feuilles"}
              </b>
              {" et "}
              <b>
                {dialog.next.dashboards.length}
                {" tableaux de bord"}
              </b>
              {". Elle remplacera les données de "}
              {"cet espace partagé pour tous les collègues"}
              {"."}
            </p>
            <p>
              {
                "Une copie de l’état actuel sera téléchargée avant la restauration."
              }
            </p>
            <div className={"modal-actions"}>
              <button className={"outline"} onClick={closeDialog}>
                {"Annuler"}
              </button>
              <button
                className={"primary"}
                onClick={async () => {
                  try {
                    (downloadBackup(),
                      await workspaceStore.replace(dialog.next),
                      closeDialog(),
                      navigate("/home"),
                      notify("Sauvegarde restaurée."));
                  } catch (j) {
                    notify(j.message);
                  }
                }}
              >
                {"Sauvegarder puis restaurer"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.type === "reload-confirm" && (
        <Modal title={"Recharger les données en ligne"} onClose={closeDialog}>
          <div className={"modal-body"}>
            <p>
              {
                "Exportez votre copie pour conserver les modifications qui n’ont pas été enregistrées. Le rechargement affichera la dernière version sauvegardée."
              }
            </p>
            <div className={"modal-actions"}>
              <button className={"outline"} onClick={downloadBackup}>
                {"Exporter ma copie"}
              </button>
              <button
                className={"primary"}
                onClick={async () => {
                  (await workspaceStore.reload(), closeDialog());
                }}
              >
                {"Recharger"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
