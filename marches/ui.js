import { mergeProposal } from "./ai-domain.mjs";
import { emptyMarket, validateMarket, minor } from "./domain.mjs";
let s = {
  rows: [],
  clients: [],
  current: null,
  docs: [],
  tab: "summary",
  dirty: false,
  busy: false,
  error: "",
  notice: "",
  loaded: false,
  history: null,
  analysis: null,
  readings: [],
  ai: null,
  progress: "",
  stop: false,
  epoch: 0,
  query: "",
  uploadStatus: "",
  suggestions: null,
};
const el = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();
const allowed = () => isAdmin(AUTH_USER);
function error(message) {
  s.error = message;
  render(true);
  el("marketMessage")?.scrollIntoView({ block: "nearest" });
}
async function api(path = "", options = {}) {
  const user = AUTH_USER,
    epoch = s.epoch,
    session = await budgetsEnsureSession();
  if (user !== AUTH_USER || epoch !== s.epoch)
    throw new Error("La session a changé.");
  const response = await fetch(budgetsApi() + "/markets" + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + session.token,
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(150000),
  });
  if (user !== AUTH_USER || epoch !== s.epoch)
    throw new Error("La session a changé.");
  if (options.binary && response.ok) {
    const blob = await response.blob();
    if (user !== AUTH_USER || epoch !== s.epoch)
      throw new Error("La session a changé.");
    return blob;
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Service des marchés indisponible. Votre saisie est conservée.",
    );
  }
  if (user !== AUTH_USER || epoch !== s.epoch)
    throw new Error("La session a changé.");
  if (!response.ok) {
    if (response.status === 401) budgetsClearSession();
    throw new Error(data.error || "Opération impossible.");
  }
  return data;
}
function setBusy(value) {
  s.busy = value;
  render(true);
}
function dirty() {
  s.dirty = true;
  s.error = "";
  s.notice = "";
  render(true);
}
function safeLeave() {
  if (s.busy) {
    alert(
      "Une opération est en cours. Utilisez « Arrêter après ce passage » avant de quitter.",
    );
    return false;
  }
  return (
    !s.dirty ||
    confirm(
      "Des modifications de marché ne sont pas enregistrées. Quitter cette fiche ?",
    )
  );
}
function forget() {
  unmount();
  s = {
    rows: [],
    clients: [],
    current: null,
    docs: [],
    tab: "summary",
    dirty: false,
    busy: false,
    error: "",
    notice: "",
    loaded: false,
    history: null,
    analysis: null,
    readings: [],
    ai: null,
    progress: "",
    stop: false,
    epoch: s.epoch + 1,
    query: "",
    uploadStatus: "",
    suggestions: null,
  };
}
async function enter() {
  if (!allowed()) {
    render();
    return;
  }
  if (s.loaded) {
    render();
    return;
  }
  s.busy = true;
  render();
  const epoch = s.epoch;
  try {
    const result = await api();
    if (epoch !== s.epoch) return;
    s.rows = result.markets;
    s.clients = result.clients || [];
    s.loaded = true;
    s.error = "";
  } catch (e) {
    if (epoch === s.epoch) s.error = e.message;
  } finally {
    if (epoch === s.epoch) {
      s.busy = false;
      if (currentView === "marches") render();
    }
  }
}
async function open(id) {
  if (!safeLeave()) return;
  setBusy(true);
  const epoch = s.epoch;
  try {
    const r = await api("/" + id);
    if (epoch !== s.epoch) return;
    s.current = { ...r.market, conditions: r.market.conditions || [] };
    s.docs = r.documents;
    s.tab = "summary";
    s.analysis = null;
    s.readings = [];
    s.ai = null;
    s.dirty = false;
    s.error = "";
    s.notice = "";
    s.history = null;
    s.uploadStatus = "";
    s.suggestions = null;
    await loadAnalysis();
    render();
  } catch (e) {
    if (epoch === s.epoch) error(e.message);
  } finally {
    if (epoch === s.epoch) setBusy(false);
  }
}
function newMarket() {
  if (!safeLeave()) return;
  s.current = { ...emptyMarket(), id: uid(), version: 0 };
  s.docs = [];
  s.tab = "setup";
  s.analysis = null;
  s.readings = [];
  s.ai = null;
  s.dirty = false;
  s.error = "";
  s.notice = "";
  s.history = null;
  s.uploadStatus = "";
  s.suggestions = null;
  render();
  el("mk-title")?.focus();
}
function assign(path, value) {
  const keys = path.split(".");
  let target = s.current;
  for (const k of keys.slice(0, -1)) target = target[k];
  target[keys.at(-1)] = value;
}
function inputValue(e) {
  const path = e.dataset.path;
  let value = e.type === "checkbox" ? e.checked : e.value;
  if (path.endsWith("amountMinor") || path === "minimumMinor" || path === "maximumMinor")
    value = minor(value);
  if (path === "renewalCount" || path === "initialDurationMonths") value = value === "" ? null : Number(value);
  assign(path, value);
  if (path === "noMinimum" && value) {
    s.current.minimumMinor = null;
    if (el("mk-minimumMinor")) el("mk-minimumMinor").value = "";
  }
  if (path === "clientName")
    s.current.clientId = s.clients.find((c) => c.name === value)?.id || "";
  if (path !== "status" && s.current.status === "validated")
    s.current.status = "draft";
  const parts = path.split(".");
  if (["prices", "ceilings", "periods", "conditions"].includes(parts[0])) {
    s.current[parts[0]][parts[1]].status = "proposed";
  }
  if (
    parts[0] === "issues" &&
    parts.length > 2 &&
    s.current.issues[parts[1]].status === "resolved"
  ) {
    s.current.issues[parts[1]].status = "open";
  }
  dirty();
}
function exportFile(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function save() {
  const epoch = s.epoch;
  const form = el("mkForm");
  if (form && !form.reportValidity()) return false;
  try {
    const m = validateMarket(s.current, s.docs);
    setBusy(true);
    const epoch = s.epoch;
    const r = await api(s.current.version ? "/" + s.current.id : "", {
      method: s.current.version ? "PUT" : "POST",
      headers: s.current.version
        ? { "If-Match": String(s.current.version) }
        : {},
      body: JSON.stringify(
        s.current.version ? m : { id: s.current.id, market: m },
      ),
    });
    if (epoch !== s.epoch) return;
    s.current = r.market;
    s.docs = r.documents;
    s.dirty = false;
    s.history = null;
    s.error = "";
    s.notice = "Fiche enregistrée · version " + s.current.version;
    const i = s.rows.findIndex((x) => x.id === s.current.id);
    if (i >= 0) s.rows[i] = s.current;
    else s.rows.unshift(s.current);
    s.busy = false;
    render();
    return true;
  } catch (e) {
    if (epoch === s.epoch) {
      s.busy = false;
      setBusy(false);
      error(e.message);
    }
    return false;
  }
}
function add(list,expense) {
  const common = {
    id: uid(),
    status: "proposed",
    source: { documentId: "", locator: "", note: "" },
  };
  const row =
    list === "prices"
      ? {
          ...common,
          label: expense==='mission'?"Frais de mission":expense==='travel'?"Frais de déplacement":"",
          unit: expense?'unit':"day",
          amountMinor: null,
          profile: "",
          location: "",
          startDate: "",
          endDate: "",
          notes: "",
        }
      : list === "ceilings"
        ? {
            ...common,
            label: "",
            amountMinor: null,
            basis: "HT",
            scope: "annual",
            periodId: "",
            consumptionBasis: "orders",
            notes: "",
          }
        : list === "periods"
          ? { ...common, label: "", startDate: "", endDate: "", decision: "" }
          : list === "conditions"
            ? { ...common, category: "payment", label: "", value: "" }
            : {
                id: uid(),
                title: "",
                detail: "",
                blocking: false,
                status: "open",
                resolution: "",
                source: { documentId: "", locator: "", note: "" },
              };
  s.current[list].push(row);
  dirty();
  render();
  const rule = document.querySelector(".mk-rule:last-of-type");
  rule?.scrollIntoView({ block: "center" });
  rule?.querySelector("input")?.focus();
}
async function extract(file) {
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await import("./marches/vendor/pdf.mjs");
    pdf.GlobalWorkerOptions.workerSrc = new URL(
      "marches/vendor/pdf.worker.mjs",
      location.href,
    ).href;
    const document = await pdf.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    try {
      let text = "";
      for (let i = 1; i <= Math.min(document.numPages, 150); i++) {
        const page = await document.getPage(i);
        const data = await page.getTextContent();
        text +=
          "[Page " +
          i +
          "]\n" +
          data.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("") +
          "\n";
        if (text.length > 150000) break;
      }
      return text.replace(/\[Page \d+\]\s*/g, "").trim()
        ? text.slice(0, 150000)
        : "";
    } finally {
      await document.destroy();
    }
  }
  if (/\.(txt|csv)$/i.test(file.name))
    return (await file.text()).slice(0, 150000);
  return "";
}
async function upload(files) {
  const epoch = s.epoch;
  if (!files.length) return;
  const kind = el("mkDocKind")?.value || "other";
  if (!s.current.version) {
    s.current.title = s.current.title.trim() || "Marché à identifier";
    s.current.clientName = s.current.clientName.trim() || "Client à identifier";
    if (!(await save())) return;
  }
  if (epoch !== s.epoch) return;
  setBusy(true);
  let count = 0,
    duplicates = 0,
    scan = 0;
  try {
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(file.name + " dépasse 5 Mo.");
      s.uploadStatus = "Lecture et import : " + file.name;
      render(true);
      let text = "";
      try {
        text = await extract(file);
      } catch {
        scan++;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("text", text);
      const r = await api("/" + s.current.id + "/documents", {
        method: "POST",
        body: form,
      });
      if (epoch !== s.epoch) return;
      if (r.duplicate) duplicates++;
      else {
        count++;
        s.docs.push(r.document);
      }
    }
    s.notice =
      count +
      " pièce(s) importée(s)" +
      (duplicates ? " · " + duplicates + " doublon(s) déjà présent(s)" : "") +
      (scan ? " · Certaines pièces demandent une lecture manuelle." : "");
    s.error = "";
    s.busy = false;
    render();
  } catch (e) {
    if (epoch === s.epoch) {
      s.busy = false;
      render();
      error(e.message + " Les pièces déjà importées sont conservées.");
    }
  }
}
async function analyse(id) {
  const epoch = s.epoch;
  try {
    setBusy(true);
    const r = await api(
      "/" + s.current.id + "/documents/" + id + "?analysis=1",
    );
    if (epoch !== s.epoch) return;
    s.suggestions = { documentId: id, items: r.suggestions };
    render(true);
  } catch (e) {
    if (epoch === s.epoch) error(e.message);
  } finally {
    if (epoch === s.epoch) setBusy(false);
  }
}
function bind() {
  const root = el("marketRoot");
  if (!root || boundRoot === root) return;
  boundRoot = root;
  el("mkForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    save();
  });
  el("mkFiles")?.addEventListener("change", (e) => upload([...e.target.files]));
  root.addEventListener("input", (e) => {
    if (e.target.dataset.path) {
      try {
        inputValue(e.target);
        e.target.setCustomValidity("");
      } catch (err) {
        e.target.setCustomValidity(err.message);
        dirty();
      }
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.dataset.review) {
      const [list, index] = e.target.dataset.review.split(".");
      s.current[list][index].status = e.target.checked
        ? "validated"
        : "proposed";
      if (s.current.status === "validated") s.current.status = "draft";
      dirty();
    }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.action === "stop-analysis") {
      s.stop = true;
      s.progress = "Arrêt demandé après le passage en cours…";
      render(true);
      return;
    }
    if (s.busy) return;
    if (b.dataset.addExpense) {add('prices',b.dataset.addExpense);return;}
    if (b.dataset.action === "add-project") {
      s.current.projects ||= [];
      s.current.projects.push({id:uid(),name:"",code:"",notes:"",archived:false,orders:[]});
      dirty(); render(); return;
    }
    if (b.dataset.addOrder !== undefined) {
      const project=s.current.projects?.[Number(b.dataset.addOrder)];
      if(project&&!project.archived){project.orders.push({id:uid(),reference:"",date:"",amountMinor:null,documentId:"",notes:"",archived:false});dirty();render();}
      return;
    }
    if (b.dataset.toggleProject !== undefined) {
      const project=s.current.projects?.[Number(b.dataset.toggleProject)];
      if(project){project.archived=!project.archived;dirty();render();}return;
    }
    if (b.dataset.toggleOrder !== undefined) {
      const [i,j]=b.dataset.toggleOrder.split(".").map(Number),order=s.current.projects?.[i]?.orders[j];
      if(order){order.archived=!order.archived;dirty();render();}return;
    }
    if (b.dataset.completeProject !== undefined) {
      const project=s.current.projects?.[Number(b.dataset.completeProject)];
      if(!project?.name.trim()||project.orders.some(o=>!o.reference.trim())){error("Renseignez le nom du projet et la référence de chaque bon de commande.");return;}
      await save();return;
    }
    if (b.dataset.suggestion !== undefined) {
      const suggestion = s.suggestions?.items[Number(b.dataset.suggestion)];
      if (!suggestion || !suggestion.basis) return;
      s.current.ceilings.push({
        id: uid(),
        label: suggestion.annual ? "Maximum annuel" : "Plafond à confirmer",
        scope: suggestion.annual ? "annual" : "contract",
        periodId: "",
        amountMinor: suggestion.value,
        basis: suggestion.basis,
        consumptionBasis: "orders",
        notes: "Proposition de lecture à vérifier.",
        status: "proposed",
        source: {
          documentId: s.suggestions.documentId,
          locator: "",
          note: suggestion.excerpt,
        },
      });
      dirty();
      s.tab = "ceilings";
      render();
      return;
    }
    if (b.dataset.resolve !== undefined) {
      await resolveIssue(Number(b.dataset.resolve));
      return;
    }
    if (b.dataset.action === "run-analysis") {
      await runAnalysis();
      return;
    }
    if (b.dataset.action === "apply-analysis") {
      await applyAnalysis();
      return;
    }
    if (b.dataset.action === "reload-analysis") {
      await loadAnalysis();
      render();
      return;
    }
    if (b.dataset.open) {
      await open(b.dataset.open);
      return;
    }
    if (b.dataset.tab) {
      const invalid = el("mkForm")?.querySelector(":invalid");
      if (invalid) {
        invalid.reportValidity();
        return;
      }
      s.tab = b.dataset.tab;
      render();
      return;
    }
    if (b.dataset.add) {
      add(b.dataset.add);
      return;
    }
    if (b.dataset.remove) {
      const [list, index] = b.dataset.remove.split(".");
      if (
        confirm(
          "Retirer cette ligne de la fiche ? Les versions déjà enregistrées restent conservées.",
        )
      ) {
        s.current[list].splice(Number(index), 1);
        dirty();
        render();
      }
      return;
    }
    if (b.dataset.download) {
      const epoch = s.epoch;
      try {
        setBusy(true);
        const blob = await api(
          "/" + s.current.id + "/documents/" + b.dataset.download,
          { binary: true },
        );
        if (epoch !== s.epoch) return;
        const d = s.docs.find((d) => d.id === b.dataset.download);
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = d.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      } catch (e) {
        if (epoch === s.epoch) error(e.message);
      } finally {
        if (epoch === s.epoch) setBusy(false);
      }
      return;
    }
    if (b.dataset.analyse) {
      await analyse(b.dataset.analyse);
      return;
    }
    if (b.dataset.version) {
      exportFile(
        s.history.find((x) => x.version === Number(b.dataset.version)),
        "marche-version-" + b.dataset.version + ".json",
      );
      return;
    }
    if (b.dataset.action === "new") newMarket();
    if (b.dataset.action === "back" && safeLeave()) {
      s.current = null;
      s.dirty = false;
      s.error = "";
      s.notice = "";
      render();
    }
    if (b.dataset.action === "save") await save();
    if (b.dataset.action === "export")
      exportFile(
        { market: s.current, documents: s.docs },
        "marche-" +
          (s.current.reference || "preparation").replace(/[^a-z0-9_-]/gi, "_") +
          ".json",
      );
    if (b.dataset.action === "refresh") {
      s.loaded = false;
      await enter();
    }
    if (b.dataset.action === "history") {
      const epoch = s.epoch;
      try {
        setBusy(true);
        const result = await api("/" + s.current.id + "/history");
        if (epoch !== s.epoch) return;
        s.history = result.versions;
        s.busy = false;
        render();
      } catch (e) {
        if (epoch === s.epoch) error(e.message);
      } finally {
        if (epoch === s.epoch) setBusy(false);
      }
    }
  });
}
window.addEventListener("beforeunload", (e) => {
  if (s.dirty || s.busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
Object.assign(window, {
  renderMarches: render,
  marchesEnter: enter,
  marchesLeave: safeLeave,
  marchesForget: forget,
  marchesNew: newMarket,
  marchesUnmount: unmount,
});
async function loadAnalysis() {
  if (!s.current?.version) return;
  const epoch = s.epoch,
    id = s.current.id,
    r = await api("/" + id + "/analysis");
  if (epoch !== s.epoch || s.current?.id !== id) return;
  s.analysis = r.run;
  s.readings = r.documents;
  s.ai = r.ai;
}
async function resolveIssue(index) {
  const item = s.current.issues[index];
  if (!item) return;
  if (item.status !== "resolved" && !item.resolution.trim()) {
    const control = el("mk-issues-" + index + "-resolution");
    control?.focus();
    error("Renseignez la décision retenue avant de valider ce point.");
    return;
  }
  item.status = item.status === "resolved" ? "open" : "resolved";
  if (item.status === "open" && s.current.status === "validated")
    s.current.status = "draft";
  dirty();
  if (await save()) {
    s.notice =
      item.status === "resolved"
        ? "Point validé et décision enregistrée. Ajustez les paramètres concernés si nécessaire."
        : "Point rouvert et enregistré.";
    render();
  }
}
async function runAnalysis() {
  const selected = [
    ...document.querySelectorAll("[data-ai-document]:checked"),
  ].map((e) => e.dataset.aiDocument);
  if (s.dirty && !(await save())) return;
  if (!s.current.version) return;
  if (!selected.length) {
    error("Sélectionnez au moins une pièce.");
    return;
  }
  const epoch = s.epoch,
    id = s.current.id;
  s.stop = false;
  s.progress = "Préparation des documents…";
  s.error = "";
  s.busy = true;
  render();
  const progress = (message) => {
    s.progress = message;
    render(true);
  };
  try {
    await loadAnalysis();
    if (!s.ai?.configured)
      throw new Error(
        "Le moteur IA n’est pas encore activé sur le serveur. Vous pouvez continuer le paramétrage manuel.",
      );
    const { readDocument } = await import("./marches/reader.mjs");
    for (const did of selected) {
      if (s.stop) break;
      const d = s.docs.find((d) => d.id === did);
      if (s.readings.find((r) => r.id === did)?.read) continue;
      progress("Lecture : " + d.name);
      const blob = await api("/" + id + "/documents/" + did, { binary: true });
      const reading = await readDocument(
        new File([blob], d.name, { type: d.mime }),
        (message) => progress(d.name + " · " + message),
        () => s.stop || epoch !== s.epoch,
      );
      await api("/" + id + "/reading/" + did, {
        method: "PUT",
        body: JSON.stringify(reading),
      });
    }
    if (s.stop) {
      s.notice =
        "Lecture arrêtée. Les pièces et textes déjà préparés sont conservés.";
      return;
    }
    progress("Démarrage de l’analyse assistée…");
    const created = await api("/" + id + "/analysis", {
      method: "POST",
      headers: { "If-Match": String(s.current.version) },
      body: JSON.stringify({ documentIds: selected }),
    });
    s.analysis = created.run;
    while (s.analysis.status !== "ready" && !s.stop) {
      progress(
        "Analyse des pièces · " +
          s.analysis.completed +
          " / " +
          s.analysis.total +
          " passages terminés",
      );
      const r = await api("/" + id + "/analysis/" + s.analysis.id, {
        method: "POST",
        body: "{}",
      });
      if (epoch !== s.epoch) return;
      s.analysis = r.run;
    }
    s.notice =
      s.analysis.status === "ready"
        ? "Analyse terminée. Vérifiez les propositions ci-dessous."
        : "Analyse mise en pause. Vous pourrez la reprendre.";
  } catch (e) {
    if (epoch === s.epoch) s.error = e.message;
  } finally {
    if (epoch === s.epoch) {
      try {
        await loadAnalysis();
      } catch {}
      s.busy = false;
      s.progress = "";
      render();
    }
  }
}
async function applyAnalysis() {
  const epoch = s.epoch;
  try {
    setBusy(true);
    await loadAnalysis();
  } catch (e) {
    if (epoch === s.epoch) error(e.message);
    return;
  } finally {
    if (epoch === s.epoch) setBusy(false);
  }
  if (epoch !== s.epoch) return;
  const run = s.analysis;
  if (!run?.result) return;
  if (s.dirty) {
    error(
      "Enregistrez ou rechargez vos modifications avant d’appliquer les propositions.",
    );
    return;
  }
  if (run.stale || run.baseVersion !== s.current.version) {
    error(
      "La fiche a été modifiée depuis cette analyse. Relancez l’analyse pour conserver vos ajustements récents.",
    );
    return;
  }
  const replace = [
    ...document.querySelectorAll("[data-ai-replace]:checked"),
  ].map((e) => e.dataset.aiReplace);
  try {
    const candidate = mergeProposal(s.current, run.result, replace);
    validateMarket(candidate, s.docs);
    s.current = candidate;
    dirty();
    s.tab = "summary";
    s.notice =
      "Propositions appliquées à la saisie. Ajustez les paramètres puis cliquez sur Enregistrer.";
    render();
  } catch (e) {
    error(e.message);
  }
}

// The service/controller keeps the existing endpoints and validation. React owns every market screen.
let marketModule = null,
  marketPromise = null,
  marketMounted = null,
  boundRoot = null,
  mountEpoch = 0;
function unmount() {
  mountEpoch++;
  marketMounted?.dispose();
  marketMounted = null;
  boundRoot = null;
  el("marketsReactRoot")?.remove();
}
function render(preserveFields = false) {
  if (currentView !== "marches") return;
  const container = el("content");
  if (!allowed()) {
    unmount();
    container.textContent =
      "Le paramétrage des marchés est réservé à la direction habilitée.";
    return;
  }
  if (!marketModule) {
    if (marketPromise) return;
    container.innerHTML = loadingMarkup('Chargement des marchés…');
    if (!document.getElementById("marketStyle")) { const link=document.createElement("link"); link.id="marketStyle"; link.rel="stylesheet"; link.href="platform/markets.css?v=refinement-20261023b"; document.head.append(link); }
    marketPromise = import("./platform/markets.js?v=refinement-20261023b")
      .then((module) => {
        marketModule = module;
        marketPromise = null;
        if (currentView === "marches" && allowed()) render();
      })
      .catch(() => {
        marketPromise = null;
        if (currentView === "marches" && allowed()) {
          container.textContent = "Le module marchés n’a pas pu être chargé. ";
          const retry = document.createElement("button");
          retry.className = "btn";
          retry.textContent = "Réessayer";
          retry.onclick = () => render();
          container.append(retry);
        }
      });
    return;
  }
  if (!el("marketsReactRoot")) {
    marketMounted?.dispose();
    marketMounted = null;
    boundRoot = null;
    container.innerHTML =
      billingNavigation("marches") + '<div id="marketsReactRoot"></div>';
  }
  const props = {
    state: { ...s },
    onQuery: (query) => {
      s.query = query;
    },
  };
  if (!marketMounted)
    marketMounted = marketModule.mountMarkets(el("marketsReactRoot"), props);
  else marketMounted.update(props, !preserveFields);
  bind();
}
