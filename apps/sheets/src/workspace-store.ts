import type { WorkspaceState, WorkspaceUpdate } from "./contracts";
export type SaveStatus =
  | "loading"
  | "saved"
  | "pending"
  | "saving"
  | "error"
  | "conflict";
interface Snapshot {
  state: WorkspaceState | null;
  status: SaveStatus;
  error: string;
}
interface Envelope {
  state?: WorkspaceState;
  revision: number;
  error?: string;
}
type Transport = (options?: RequestInit) => Promise<Response>;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Le service est indisponible.";
export class SaveError extends Error {
  constructor(
    text: string,
    public conflict = false,
  ) {
    super(text);
  }
}
export function isWorkspace(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as WorkspaceState;
  return (
    Array.isArray(state.workspaces) &&
    Array.isArray(state.sheets) &&
    Array.isArray(state.dashboards) &&
    state.sheets.every(
      (sheet) =>
        sheet &&
        typeof sheet.id === "string" &&
        Array.isArray(sheet.columns) &&
        Array.isArray(sheet.rows),
    )
  );
}
/** A serialized, revision-checked write queue. No schema projection or field pruning. */
export class WorkspaceStore {
  current: { current: WorkspaceState | null } = { current: null };
  private snapshot: Snapshot = { state: null, status: "loading", error: "" };
  private listeners = new Set<() => void>();
  private revision = 0;
  private pending: WorkspaceState | null = null;
  private writing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private disposed = false;
  constructor(
    private request: Transport,
    private delay = 400,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  hasPending = () => !!(this.pending || this.writing);
  private publish(change: Partial<Snapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }
  async reload() {
    const epoch = ++this.epoch;
    clearTimeout(this.timer);
    this.publish({ status: "loading" });
    try {
      const response = await this.request(),
        result: Envelope = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Connexion ou service indisponible. Réessayez.",
        );
      if (!isWorkspace(result.state) || !Number.isSafeInteger(result.revision))
        throw new Error(
          "Format de sauvegarde incompatible. Vos données sont conservées.",
        );
      if (this.disposed || epoch !== this.epoch) return;
      this.revision = result.revision;
      this.current.current = result.state;
      this.pending = null;
      this.publish({ state: result.state, status: "saved", error: "" });
    } catch (error) {
      if (epoch === this.epoch)
        this.publish({ status: "error", error: message(error) });
    }
  }
  update = (update: WorkspaceUpdate): WorkspaceState => {
    if (this.disposed || !this.current.current)
      throw new Error("L’espace de travail n’est pas disponible.");
    const state =
      typeof update === "function" ? update(this.current.current) : update;
    this.current.current = state;
    this.pending = state;
    this.publish({
      state,
      status: this.snapshot.status === "conflict" ? "conflict" : "pending",
    });
    clearTimeout(this.timer);
    if (this.snapshot.status !== "conflict")
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, this.delay);
    return state;
  };
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.writing) return this.writing;
    if (this.snapshot.status === "conflict")
      return Promise.reject(new SaveError(this.snapshot.error, true));
    this.writing = this.drain().finally(() => {
      this.writing = null;
    });
    return this.writing;
  };
  private async drain() {
    const epoch = this.epoch;
    while (this.pending && !this.disposed) {
      const state = this.pending;
      this.pending = null;
      this.publish({ status: "saving" });
      try {
        const response = await this.request({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, revision: this.revision }),
        });
        const result: Envelope = await response.json();
        if (!response.ok)
          throw new SaveError(
            response.status === 409
              ? "Une autre fenêtre a modifié les données. Exportez votre copie avant de recharger."
              : result.error || "Échec de la sauvegarde.",
            response.status === 409,
          );
        if (!Number.isSafeInteger(result.revision))
          throw new SaveError("La confirmation de sauvegarde est invalide.");
        if (this.disposed || epoch !== this.epoch) return;
        this.revision = result.revision;
        this.publish({ error: "" });
      } catch (error) {
        if (!this.disposed && epoch === this.epoch) {
          this.pending = this.pending || state;
          this.publish({
            status:
              error instanceof SaveError && error.conflict
                ? "conflict"
                : "error",
            error: message(error),
          });
        }
        throw error;
      }
    }
    this.publish({ status: "saved" });
  }
  replace = async (state: WorkspaceState) => {
    if (!isWorkspace(state)) throw new Error("Sauvegarde incompatible.");
    await this.flush();
    this.update(state);
    await this.flush();
  };
  dispose() {
    this.disposed = true;
    this.epoch++;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
