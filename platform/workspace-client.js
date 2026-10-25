"use strict";
var CDIPlatform = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // platform/client/workspace-client.ts
  var workspace_client_exports = {};
  __export(workspace_client_exports, {
    createBudgetTransport: () => createBudgetTransport,
    recordChanges: () => recordChanges
  });

  // platform/client/action-feedback.ts
  function install() {
    let anchor = { element: null, rect: null };
    let clear = () => {
    };
    const remember = (element) => {
      if (element) anchor = { element, rect: element.getBoundingClientRect() };
    };
    document.addEventListener("click", (event) => {
      clear();
      if (event.target instanceof Element) remember(event.target.closest('button,[role="menuitem"],input[type="submit"],[data-action]'));
    }, true);
    document.addEventListener("input", () => clear(), true);
    document.addEventListener("submit", (event) => {
      remember(event.submitter || event.target?.querySelector('button[type="submit"],button:not([type])'));
    }, true);
    const style = document.createElement("style");
    style.textContent = `.cdi-action-success{position:fixed;z-index:2147483647;pointer-events:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#e4f6eb;color:#168344;box-shadow:0 3px 14px #102b161a;animation:cdi-success-in .25s ease-out}.cdi-action-success svg{width:28px;height:28px}.cdi-action-success path{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;animation:cdi-success-check .45s ease-out}.cdi-action-success span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}[data-theme=dark] .cdi-action-success{background:#173d2b;color:#86e6ad}@keyframes cdi-success-in{from{opacity:0;transform:scale(.65)}to{opacity:1;transform:scale(1)}}@keyframes cdi-success-check{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}@media(prefers-reduced-motion:reduce){.cdi-action-success,.cdi-action-success path{animation:none}}`;
    style.textContent += `
 .cdi-save-confirmed{position:relative!important;opacity:1!important;color:transparent!important;background:#e4f6eb!important;border-color:#a8dabb!important;box-shadow:0 0 0 3px #16834412!important;transition:background .2s,border-color .2s,box-shadow .2s!important;isolation:isolate}
 .cdi-save-confirmed>*:not(.cdi-button-success){opacity:0!important}
 .cdi-button-success{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 9px;border-radius:inherit;color:#168344!important;pointer-events:none;font:inherit;line-height:1.15;animation:cdi-success-in .22s ease-out}
 .cdi-button-success svg{width:20px;height:20px;flex-shrink:0}.cdi-button-success path{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;animation:cdi-success-check .45s ease-out}
 .cdi-button-success span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cdi-action-success.cdi-success-chip{width:auto;max-width:280px;height:38px;border-radius:12px;display:flex;gap:7px;padding:0 13px;font:600 13px/1.2 system-ui}
 .cdi-success-chip span{position:static;width:auto;height:auto;clip-path:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 [data-theme=dark] .cdi-save-confirmed{background:#173d2b!important;border-color:#397052!important;box-shadow:0 0 0 3px #86e6ad10!important}[data-theme=dark] .cdi-button-success{color:#86e6ad!important}
 @media(prefers-reduced-motion:reduce){.cdi-save-confirmed{transition:none!important}.cdi-button-success,.cdi-button-success path{animation:none}}
 `;
    document.head.append(style);
    function show(at, label = "Enregistr\xE9") {
      requestAnimationFrame(() => {
        clear();
        const live = at.element?.isConnected ? at.element : null, current = live?.getBoundingClientRect(), rect = current?.width && current.height ? current : at.rect;
        const inButton = !!(live?.matches("button") && current?.width && current.height && live.getClientRects().length);
        const node = document.createElement("span");
        node.className = inButton ? "cdi-button-success" : "cdi-action-success cdi-success-chip";
        node.setAttribute("role", "status");
        node.setAttribute("aria-live", "polite");
        node.innerHTML = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="m7 14 5 5L22 9"/></svg><span></span>';
        node.querySelector("span").textContent = label;
        const float = () => {
          live?.classList.remove("cdi-save-confirmed");
          node.className = "cdi-action-success cdi-success-chip";
          node.querySelector("span").style.display = "";
          const dialog = live?.closest("dialog[open]");
          (dialog?.isConnected ? dialog : document.body).append(node);
          const width = node.getBoundingClientRect().width;
          node.style.left = Math.max(8, Math.min(innerWidth - width - 8, (rect ? rect.left + rect.width / 2 : innerWidth / 2) - width / 2)) + "px";
          node.style.top = Math.max(8, Math.min(innerHeight - 46, (rect ? rect.top + rect.height / 2 : innerHeight / 2) - 19)) + "px";
        };
        let observer;
        if (inButton) {
          live.classList.add("cdi-save-confirmed");
          if (current.width < 100) {
            node.querySelector("span").style.display = "none";
            node.setAttribute("aria-label", label);
          }
          live.append(node);
          observer = new MutationObserver(() => {
            if (live?.isConnected && live.getBoundingClientRect().width) {
              if (!live.classList.contains("cdi-save-confirmed")) live.classList.add("cdi-save-confirmed");
              if (!node.isConnected) live.append(node);
            } else {
              observer?.disconnect();
              float();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          observer.observe(live, { attributes: true, attributeFilter: ["class"] });
        } else {
          float();
        }
        const timer = setTimeout(() => clear(), 2500);
        const cleanup = () => {
          clearTimeout(timer);
          observer?.disconnect();
          live?.classList.remove("cdi-save-confirmed");
          node.remove();
        };
        clear = () => {
          cleanup();
          clear = () => {
          };
        };
      });
    }
    return { capture: () => {
      const at = { ...anchor };
      return (label) => show(at, label);
    }, success: (label) => show(anchor, label) };
  }
  var feedback = typeof window === "undefined" ? null : window.CDIActionFeedback ||= install();

  // platform/record-changes.ts
  var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var own = (v, k) => Object.hasOwn(v, k);
  function equalRecordValue(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equalRecordValue(v, b[i]));
    if (object(a) && object(b)) {
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every((k) => own(b, k) && equalRecordValue(a[k], b[k]));
    }
    return false;
  }
  var keyFor = (a, b) => ["id", "matricule", "code", "columnId"].find((key) => [a, b].every((rows) => rows.every((r) => object(r) && ["string", "number"].includes(typeof r[key])) && new Set(rows.map((r) => r[key])).size === rows.length));
  function recordChanges(before, after) {
    const changes = [];
    function visit(a, b, path) {
      if (equalRecordValue(a, b)) return;
      if (Array.isArray(a) && Array.isArray(b)) {
        const key = keyFor(a, b);
        if (key) {
          const old = new Map(a.map((r) => [r[key], r])), next = new Map(b.map((r) => [r[key], r]));
          for (const r of a) if (!next.has(r[key])) changes.push({ path: [...path, { key, id: r[key] }], before: r, remove: true });
          for (const r of b) if (old.has(r[key])) visit(old.get(r[key]), r, [...path, { key, id: r[key] }]);
          for (let i = b.length - 1; i >= 0; i--) if (!old.has(b[i][key])) changes.push({ path: [...path, { key, id: b[i][key] }], value: b[i], anchor: i + 1 < b.length ? b[i + 1][key] : null });
          const left = a.filter((r) => next.has(r[key])).map((r) => r[key]), right = b.filter((r) => old.has(r[key])).map((r) => r[key]);
          if (!equalRecordValue(left, right)) changes.push({ path, before: a.map((r) => r[key]), value: b.map((r) => r[key]), order: true });
          return;
        }
      }
      if (object(a) && object(b)) {
        for (const key of /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (!own(b, key)) changes.push({ path: [...path, key], before: a[key], remove: true });
          else if (!own(a, key)) changes.push({ path: [...path, key], value: b[key] });
          else visit(a[key], b[key], [...path, key]);
        }
        return;
      }
      changes.push({ path, before: a, value: b });
    }
    const json = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
    visit(json(before), json(after), []);
    return changes;
  }

  // platform/client/workspace-client.ts
  function createBudgetTransport(send = fetch) {
    let cached;
    let baseline;
    let generation = 0;
    const clear = () => {
      cached = void 0;
      baseline = void 0;
      generation++;
    };
    return {
      clear,
      async request(url, session, method, workspace, version) {
        const key = JSON.stringify([url, session.email, session.token]);
        if (baseline && baseline.key !== key) clear();
        const start = ++generation;
        const headers = { Authorization: "Bearer " + session.token };
        if (method === "GET" && cached?.key === key) headers["If-None-Match"] = cached.tag;
        if (method === "PUT" && (!baseline || !workspace)) throw new Error("Rechargez le budget avant de modifier un enregistrement.");
        const submitted = method === "PUT" ? structuredClone(workspace) : void 0;
        const changes = method === "PUT" ? recordChanges(baseline.workspace, submitted) : void 0;
        if (method === "PUT") {
          cached = void 0;
          headers["Content-Type"] = "application/json";
        }
        let response;
        try {
          response = await send(url, { method: method === "PUT" ? "PATCH" : "GET", headers, body: method === "PUT" ? JSON.stringify({ changes }) : void 0, cache: "no-store", signal: AbortSignal.timeout(3e4) });
        } catch (error) {
          if (generation === start) cached = void 0;
          throw error;
        }
        if (generation !== start) throw new Error("La session ou le budget a chang\xE9. Rechargez les donn\xE9es.");
        if (response.status === 304) {
          if (!cached || cached.key !== key) throw new Error("La copie locale a expir\xE9. Rechargez les donn\xE9es.");
          return structuredClone(cached.value);
        }
        const value = await response.json();
        if (generation !== start) throw new Error("La session ou le budget a chang\xE9. Rechargez les donn\xE9es.");
        if (!response.ok) {
          cached = void 0;
          if (response.status === 401) clear();
          throw Object.assign(new Error(value.error || "Enregistrement impossible. R\xE9essayez."), { status: response.status });
        }
        if (method === "GET") {
          const tag = response.headers.get("ETag");
          if (tag && value.workspace && Number.isSafeInteger(value.version)) cached = { key, tag, value: structuredClone(value) };
          if (value.workspace && Number.isSafeInteger(value.version)) baseline = { key, workspace: structuredClone(value.workspace) };
        } else {
          if (!Number.isSafeInteger(value.version)) throw new Error("Confirmation de sauvegarde invalide.");
          baseline = { key, workspace: submitted };
        }
        return value;
      }
    };
  }
  return __toCommonJS(workspace_client_exports);
})();
