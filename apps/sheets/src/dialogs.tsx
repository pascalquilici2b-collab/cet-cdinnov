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
  ClipboardList as IconClipboardList,
  Download as IconDownload,
  FileSpreadsheet as IconFileSpreadsheet,
  FolderPlus as IconFolderPlus,
  LayoutDashboard as IconLayoutDashboard,
  Plus as IconPlus,
  Upload as IconUpload,
  Users as IconUsers,
} from "lucide-react";
import { Modal } from "./shared-ui";
import { readSession, signOut } from "./api";
export function CreateDialog({
  initial: initialProp,
  workspaces: workspacesProp,
  workspaceId: workspaceIdProp,
  initialFolderId: initialFolderIdProp = "",
  onClose: onCloseProp,
  onCreate: onCreateProp,
}) {
  const [p, R] = React.useState(initialProp),
    [b, M] = React.useState(""),
    [k, x] = React.useState(workspaceIdProp || workspacesProp[0]?.id || ""),
    [N, V] = React.useState(initialFolderIdProp),
    G = [
      [
        "sheet",
        "Feuille",
        IconFileSpreadsheet,
        "Organisez et suivez votre travail",
      ] as const,
      [
        "dashboard",
        "Tableau de bord",
        IconLayoutDashboard,
        "Visualisez les indicateurs du projet",
      ] as const,
      [
        "form",
        "Formulaire",
        IconClipboardList,
        "Collectez de nouvelles informations",
      ] as const,
      [
        "workspace",
        "Espace de travail",
        IconUsers,
        "Rassemblez vos éléments",
      ] as const,
      ["folder", "Dossier", IconFolderPlus, "Classez vos feuilles"] as const,
    ];
  return (
    <Modal title={"Créer un nouvel élément"} onClose={onCloseProp} wide={true}>
      <form
        className={"modal-body"}
        onSubmit={(H) => {
          (H.preventDefault(),
            b.trim() &&
              onCreateProp({
                kind: p,
                name: b.trim(),
                workspaceId: k,
                folderId: N,
              }));
        }}
      >
        <div className={"create-types"}>
          {G.map(([H, q, J, Z]) => (
            <button
              type={"button"}
              className={p === H ? "selected" : ""}
              onClick={() => R(H)}
              key={H}
            >
              <J size={24} />
              <strong>{q}</strong>
              <small>{Z}</small>
            </button>
          ))}
        </div>
        <label className={"field"}>
          {"Nom"}
          <input
            required={true}
            maxLength={200}
            value={b}
            onChange={(H) =>
              M(
                (
                  H.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              )
            }
            placeholder={
              p === "workspace"
                ? "Mon espace de travail"
                : p === "dashboard"
                  ? "Tableau de bord du projet"
                  : "Nom de votre élément"
            }
          />
        </label>
        {p !== "workspace" && (
          <label className={"field"}>
            {"Espace de travail"}
            <select
              value={k}
              onChange={(H) => {
                (x(
                  (
                    H.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                ),
                  V(""));
              }}
            >
              {workspacesProp.map((H) => (
                <option value={H.id} key={H.id}>
                  {H.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {["sheet", "form"].includes(p) && (
          <label className={"field"}>
            {"Dossier"}
            <select
              value={N}
              onChange={(H) =>
                V(
                  (
                    H.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
            >
              <option value={""}>{"Racine de l’espace de travail"}</option>
              {workspacesProp
                .find((H) => H.id === k)
                ?.folders.map((H) => (
                  <option value={H.id} key={H.id}>
                    {H.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className={"modal-actions"}>
          <button type={"button"} className={"outline"} onClick={onCloseProp}>
            {"Annuler"}
          </button>
          <button
            className={"primary"}
            disabled={!b.trim() || (p !== "workspace" && !k)}
          >
            <IconPlus size={16} />
            {"Créer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MoveDialog({
  item: itemProp,
  workspaces: workspacesProp,
  onClose: onCloseProp,
  onSave: onSaveProp,
}) {
  const [f, v] = React.useState(itemProp.workspaceId),
    [p, R] = React.useState(itemProp.folderId || "");
  return (
    <Modal title={"Déplacer l’élément"} onClose={onCloseProp}>
      <form
        className={"modal-body"}
        onSubmit={(b) => {
          (b.preventDefault(), onSaveProp(f, p || null));
        }}
      >
        <p>{itemProp.name}</p>
        <label className={"field"}>
          {"Espace de travail"}
          <select
            value={f}
            onChange={(b) => {
              (v(
                (
                  b.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              ),
                R(""));
            }}
          >
            {workspacesProp.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {itemProp.rows && (
          <label className={"field"}>
            {"Dossier"}
            <select
              value={p}
              onChange={(b) =>
                R(
                  (
                    b.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
            >
              <option value={""}>{"Racine de l’espace de travail"}</option>
              {workspacesProp
                .find((b) => b.id === f)
                ?.folders.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className={"modal-actions"}>
          <button type={"button"} className={"outline"} onClick={onCloseProp}>
            {"Annuler"}
          </button>
          <button className={"primary"}>{"Déplacer"}</button>
        </div>
      </form>
    </Modal>
  );
}
export function SettingsDialog({
  state: stateProp,
  update: updateProp,
  onClose: onCloseProp,
  onBackup: onBackupProp,
  onImport: onImportProp,
  onCSV: onCSVProp,
}) {
  const [p, R] = React.useState(stateProp.profile.name),
    [b, M] = React.useState(stateProp.profile.organization);
  return (
    <Modal title={"Compte et sauvegardes"} onClose={onCloseProp}>
      <form
        className={"modal-body"}
        onSubmit={(k) => {
          (k.preventDefault(),
            updateProp((x) => ({
              ...x,
              profile: {
                ...x.profile,
                name: p.trim(),
                organization: b.trim(),
              },
            })),
            onCloseProp());
        }}
      >
        <div className={"profile-banner"}>
          <span className={"avatar"}>{p.slice(0, 1)}</span>
          <div>
            <b>{"Compte CDInnov"}</b>
            <p>{readSession()?.email}</p>
          </div>
        </div>
        <label className={"field"}>
          {"Nom de l’espace partagé"}
          <input
            required={true}
            maxLength={100}
            value={p}
            onChange={(k) =>
              R(
                (
                  k.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              )
            }
          />
        </label>
        <label className={"field"}>
          {"Organisation"}
          <input
            maxLength={200}
            value={b}
            onChange={(k) =>
              M(
                (
                  k.target as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).value,
              )
            }
          />
        </label>
        <div className={"settings-options"}>
          <button type={"button"} onClick={onBackupProp}>
            <IconDownload size={18} />
            <span>
              <b>{"Exporter une sauvegarde complète"}</b>
              <small>
                {
                  "Feuilles, formulaires, commentaires et tableaux de bord · JSON"
                }
              </small>
            </span>
          </button>
          <button type={"button"} onClick={onImportProp}>
            <IconUpload size={18} />
            <span>
              <b>{"Restaurer une sauvegarde"}</b>
              <small>{"Importer un fichier JSON de cette application"}</small>
            </span>
          </button>
          <button type={"button"} onClick={onCSVProp}>
            <IconFileSpreadsheet size={18} />
            <span>
              <b>{"Importer une feuille CSV"}</b>
              <small>
                {"Créer une nouvelle feuille à partir d’un fichier"}
              </small>
            </span>
          </button>
        </div>
        <div className={"modal-actions"}>
          <button type={"button"} className={"outline"} onClick={onCloseProp}>
            {"Fermer"}
          </button>
          <button
            type={"button"}
            className={"outline"}
            onClick={() => {
              confirm(
                "Vous déconnecter de CDInnov ? Enregistrez vos modifications avant de continuer.",
              ) && signOut();
            }}
          >
            {"Déconnexion"}
          </button>
          <button className={"primary"} disabled={!p.trim()}>
            {"Enregistrer le profil"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
