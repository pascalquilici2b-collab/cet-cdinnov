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
