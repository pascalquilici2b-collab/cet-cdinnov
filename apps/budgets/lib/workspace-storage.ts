import type { Workspace } from "./budget-model";

export type WorkspaceStorage = {
  empty?: boolean;
  load: () => Promise<Workspace | null>;
  save: (workspace: Workspace) => Promise<void>;
  dirty?: (value: boolean) => void;
};

export const emptyWorkspace: Workspace = { demo: false, clients: [], projects: [], budgetLines: [], expenses: [], drs: [], imports: [] };

export const localStorageApi: WorkspaceStorage = {
  async load() {
    const response = await fetch("/api/workspace");
    if (!response.ok) throw new Error("Chargement impossible");
    return ((await response.json()) as {workspace:Workspace|null}).workspace;
  },
  async save(workspace) {
    const response = await fetch("/api/workspace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(workspace) });
    if (!response.ok) throw new Error("Enregistrement impossible. Gardez cette page ouverte puis réessayez.");
  },
};
