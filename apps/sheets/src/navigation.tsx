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
  ArrowRight as IconArrowRight,
  Bell as IconBell,
  ChartPie as IconChartPie,
  Check as IconCheck,
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  FileSpreadsheet as IconFileSpreadsheet,
  FolderPlus as IconFolderPlus,
  Plus as IconPlus,
  Search as IconSearch,
  Star as IconStar,
  Upload as IconUpload,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
export const navigationTitles = {
  recents: "Récents",
  favorites: "Favoris",
  create: "Créer",
  activity: "Notifications",
};
export function NavigationPopover({
  type: typeProp,
  top: topProp = 100,
  items: itemsProp,
  recents: recentsProp,
  activity: activityProp = [],
  workspaces: workspacesProp,
  onClose: onCloseProp,
  onOpen: onOpenProp,
  onFavorite: onFavoriteProp,
  onCreate: onCreateProp,
  onImport: onImportProp,
  onNavigate: onNavigateProp,
}) {
  const N = React.useRef(null),
    [V, G] = React.useState("");
  (React.useEffect(() => {
    const q = document.activeElement as HTMLElement;
    (
      N.current?.querySelector("input") ||
      N.current?.querySelector("[data-nav-choice]") ||
      N.current?.querySelector("button")
    )?.focus();
    const J = (F) => {
        !N.current?.contains(F.target as Node) &&
          !(F.target as HTMLElement).closest(".rail") &&
          onCloseProp();
      },
      Z = (F) => {
        if (
          (F.key === "Escape" && (F.preventDefault(), onCloseProp()),
          !["ArrowDown", "ArrowUp"].includes(F.key) ||
            !N.current?.contains(F.target as Node))
        )
          return;
        const P = [
          ...(N.current as HTMLElement).querySelectorAll<HTMLElement>(
            "[data-nav-choice]",
          ),
        ];
        if (!P.length) return;
        const ee = P.indexOf(document.activeElement as HTMLElement),
          Se =
            ee < 0
              ? F.key === "ArrowDown"
                ? 0
                : P.length - 1
              : (ee + (F.key === "ArrowDown" ? 1 : -1) + P.length) % P.length;
        (F.preventDefault(), P[Se].focus());
      };
    return (
      document.addEventListener("pointerdown", J),
      document.addEventListener("keydown", Z),
      () => {
        (document.removeEventListener("pointerdown", J),
          document.removeEventListener("keydown", Z),
          q?.focus());
      }
    );
  }, [typeProp]),
    React.useEffect(() => G(""), [typeProp]));
  const H = itemsProp
    .filter((q) =>
      typeProp === "favorites" ? q.favorite : recentsProp.includes(q.id),
    )
    .filter((q) => q.name.toLocaleLowerCase().includes(V.toLocaleLowerCase()))
    .sort((q, J) =>
      typeProp === "recents"
        ? recentsProp.indexOf(q.id) - recentsProp.indexOf(J.id)
        : q.name.localeCompare(J.name, "fr"),
    );
  return (
    <aside
      className={`navigation-popover navigation-${typeProp}`}
      style={{ top: Math.max(12, Math.min(topProp, window.innerHeight - 410)) }}
      ref={N}
      role={"dialog"}
      aria-label={navigationTitles[typeProp]}
    >
      <header>
        <h2>{navigationTitles[typeProp]}</h2>
        <button
          className={"icon-btn"}
          aria-label={`Fermer ${navigationTitles[typeProp]}`}
          onClick={onCloseProp}
        >
          <IconX size={16} />
        </button>
      </header>
      {["recents", "favorites"].includes(typeProp) && (
        <React.Fragment>
          <label className={"navigation-search"}>
            <IconSearch size={18} />
            <input
              type={"search"}
              aria-label={`Rechercher dans les ${navigationTitles[typeProp].toLowerCase()}`}
              placeholder={"Rechercher par nom"}
              value={V}
              onChange={(q) =>
                G(
                  (
                    q.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
            />
          </label>
          <div className={"navigation-items"}>
            {H.map((q) => (
              <div className={"navigation-row"} key={q.id}>
                <button
                  data-nav-choice={true}
                  title={`${q.name}
${workspacesProp.find((J) => J.id === q.workspaceId)?.name || ""}`}
                  onClick={() => onOpenProp(q)}
                >
                  {q.kind === "dashboard" ? (
                    <IconChartPie size={15} className={"nav-dashboard-icon"} />
                  ) : (
                    <IconFileSpreadsheet
                      size={15}
                      className={"nav-sheet-icon"}
                    />
                  )}
                  <span>{q.name}</span>
                </button>
                <button
                  className={`navigation-star ${q.favorite ? "is-favorite" : ""}`}
                  title={
                    q.favorite ? "Retirer des favoris" : "Ajouter aux favoris"
                  }
                  aria-label={`${q.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} : ${q.name}`}
                  onClick={() => onFavoriteProp(q)}
                >
                  <IconStar
                    size={15}
                    fill={q.favorite ? "currentColor" : "none"}
                  />
                </button>
              </div>
            ))}
            {!H.length && (
              <div className={"navigation-empty"}>
                {typeProp === "favorites" ? (
                  <IconStar size={26} />
                ) : (
                  <IconClock size={26} />
                )}
                <b>
                  {V
                    ? "Aucun résultat"
                    : typeProp === "favorites"
                      ? "Aucun favori pour le moment"
                      : "Aucun élément récent"}
                </b>
                <p>
                  {V
                    ? "Essayez un autre nom."
                    : typeProp === "favorites"
                      ? "Cliquez sur l’étoile d’un élément pour le retrouver ici."
                      : "Les feuilles et tableaux de bord ouverts apparaîtront ici."}
                </p>
              </div>
            )}
          </div>
          <footer>
            <button onClick={() => onNavigateProp(`/${typeProp}`)}>
              {"Afficher tous les éléments"}
              <IconArrowRight size={14} />
            </button>
          </footer>
        </React.Fragment>
      )}
      {typeProp === "create" && (
        <React.Fragment>
          <p className={"navigation-caption"}>{"Créer un nouvel élément"}</p>
          <div className={"navigation-create-options"}>
            {[
              [
                "sheet",
                "Feuille",
                IconFileSpreadsheet,
                "Organiser et suivre le travail",
              ] as const,
              [
                "dashboard",
                "Tableau de bord",
                IconChartPie,
                "Présenter les indicateurs",
              ] as const,
              [
                "form",
                "Formulaire",
                IconClipboardList,
                "Collecter des informations",
              ] as const,
              [
                "workspace",
                "Espace de travail",
                IconUsers,
                "Rassembler les éléments",
              ] as const,
              [
                "folder",
                "Dossier",
                IconFolderPlus,
                "Classer vos feuilles",
              ] as const,
            ].map(([q, J, Z, F]) => (
              <button
                data-nav-choice={true}
                onClick={() => onCreateProp(q)}
                key={q}
              >
                <Z size={20} />
                <span>
                  <b>{J}</b>
                  <small>{F}</small>
                </span>
                <IconPlus size={14} />
              </button>
            ))}
          </div>
          <footer>
            <button onClick={onImportProp}>
              <IconUpload size={16} />
              {"Importer un fichier CSV"}
            </button>
          </footer>
        </React.Fragment>
      )}
      {typeProp === "activity" && (
        <React.Fragment>
          <p className={"navigation-caption"}>
            {"Activité de votre espace local"}
          </p>
          <div className={"navigation-events"}>
            {activityProp.map((q) => (
              <article key={q.id}>
                <span>
                  <IconCheck size={15} />
                </span>
                <div>
                  <p>{q.text}</p>
                  <time>
                    {new Date(q.createdAt).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </article>
            ))}
            {!activityProp.length && (
              <div className={"navigation-empty"}>
                <IconBell size={32} />
                <b>{"Tout est à jour"}</b>
                <p>
                  {
                    "Les créations et les réponses aux formulaires apparaîtront ici."
                  }
                </p>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </aside>
  );
}
