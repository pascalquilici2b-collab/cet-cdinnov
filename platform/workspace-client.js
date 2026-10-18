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
    createBudgetTransport: () => createBudgetTransport
  });
  function createBudgetTransport(send = fetch) {
    let cached;
    let generation = 0;
    const clear = () => {
      cached = void 0;
      generation++;
    };
    return {
      clear,
      async request(url, session, method, workspace, version) {
        const key = JSON.stringify([url, session.email, session.token]);
        if (cached && cached.key !== key) clear();
        const start = ++generation;
        const headers = { Authorization: "Bearer " + session.token };
        if (method === "GET" && cached?.key === key) headers["If-None-Match"] = cached.tag;
        if (method === "PUT") {
          cached = void 0;
          headers["Content-Type"] = "application/json";
          headers["If-Match"] = String(version);
        }
        let response;
        try {
          response = await send(url, { method, headers, body: method === "PUT" ? JSON.stringify(workspace) : void 0, cache: "no-store", signal: AbortSignal.timeout(3e4) });
        } catch (error) {
          if (generation === start) clear();
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
          clear();
          throw Object.assign(new Error(value.error || "Enregistrement impossible. R\xE9essayez."), { status: response.status });
        }
        if (method === "GET") {
          const tag = response.headers.get("ETag");
          if (tag && value.workspace && Number.isSafeInteger(value.version)) cached = { key, tag, value: structuredClone(value) };
        }
        return value;
      }
    };
  }
  return __toCommonJS(workspace_client_exports);
})();
