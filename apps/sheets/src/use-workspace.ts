import { useEffect, useState, useSyncExternalStore } from "react";
import { readSession, requestState } from "./api";
import { WorkspaceStore } from "./workspace-store";
export function useWorkspace() {
  const [store] = useState(() => {
    const owner = readSession()?.email;
    return new WorkspaceStore((options) => requestState(options, owner));
  });
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.reload();
    const unload = (event: BeforeUnloadEvent) => {
      if (store.hasPending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("beforeunload", unload);
      store.dispose();
    };
  }, [store]);
  const reload = async () => {
    if (
      store.hasPending() &&
      !confirm(
        "Des modifications ne sont pas enregistrées. Exportez votre copie pour les conserver. Recharger la version en ligne ?",
      )
    )
      return;
    await store.reload();
  };
  return {
    ...snapshot,
    update: store.update,
    flush: store.flush,
    reload,
    replace: store.replace,
    current: store.current,
  };
}
