import { handleMarkets } from "../marches/worker.mjs";
// work/deployment/worker/budget-service.mjs
import { timingSafeEqual, createHash, createHmac, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
var nameKey = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
var clientCatalog = [
  ["Chambre de Commerce et d'Industrie de Corse", ["CCI Corse", "CCI Haute Corse", "CCI de la Haute Corse", "CCI de Haute Corse", "CCIC", "CCIT Haute Corse", "CCI 2A", "CCI2A", "CCI 2B", "Chambre de commerce 2B", "EPCI de Corse", "EPCIC", "Etablissement Public du Commerce", "Etablissement Public du Commerce et de l Industrie de Corse", "Etablissement public de Commerce et d Industrie de Corse", "CCI Ajaccio et Corse du Sud", "Chambre de Commerce Territoriale de Bastia et Hte Corse"]],
  ["Chambre de m\xE9tiers et de l'artisanat de Corse", ["CMAR Corse", "CMARC", "CMA Corse"]],
  ["Agence de d\xE9veloppement \xE9conomique de la Corse", ["ADEC", "Agence Developpement Economique de la Corse", "Agence de Developpement de la Corse", "Agence de Developpement Econimique de la Corse", "Agence Developpement Econimique de la Corse", "Agenge de Developpement Economique de la Corse"]],
  ["Office de l'environnement de la Corse", ["OEC", "Office Environnement de la Corse"]],
  ["Agence du tourisme de la Corse", ["ATC"]],
  ["Collectivit\xE9 de Corse", ["CTC", "CDC", "Collectivit\xE9 Territoriale de Corse", "CG 2A", "CG Corse du Sud", "CG Haute Corse", "D\xE9partement Haute Corse", "Conseil D\xE9partemental de la Haute Corse", "Conseil G\xE9n\xE9ral de Corse du Sud", "Conseil G\xE9n\xE9ral de la Corse du Sud", "Conseil G\xE9n\xE9ral de la Corse duSud", "Conseil G\xE9n\xE9ral de la Cors du Sud", "Conseil G\xE9n\xE9ral de Haute Corse", "Conseil G\xE9n\xE9ral Haute Corse", "Conseil G\xE9n\xE9ral de la Haute Corse"]],
  ["CCI du Var", ["Chambre de Commerce et d'Industrie du Var", "Chambre de Commerce et Industrie du Var", "Chambre de Commerce du Var"]],
  ["CCI Nice C\xF4te d'Azur", ["CCI Nice Cote Azur"]],
  ["CCI Provence-Alpes-C\xF4te d'Azur", ["CCI r\xE9gion PACA", "CCI PACA"]],
  ["CRESS Corsica", ["CRESS Corse"]],
  ["Communaut\xE9 d'agglom\xE9ration de Bastia", ["CAB", "Communaut\xE9 Agglom\xE9ration Bastia", "Communaut\xE9 d Agglom\xE9ration Bastia"]],
  ["Communaut\xE9 d'agglom\xE9ration du Pays Ajaccien", ["CAPA", "Com Agglo Pays Ajaccien", "Comm Agglo Pays Ajaccien"]],
  ["Communaut\xE9 de communes de L'\xCEle-Rousse \u2013 Balagne", ["Communaut\xE9 de Communes Ile Rousse Balagne", "Communaut\xE9 de Communes Bassin Ile Rousse"]],
  ["D\xE9partement du Var", ["Conseil D\xE9partemental du Var"]],
  ["Office de tourisme de Bastia", ["Office de tourisme de l'agglom\xE9ration de Bastia", "Office de tourisme d'agglom\xE9ration de Bastia", "Office de tourisme intercommunal de Bastia"]],
  ["ATEMIS \xB7 RED SAS", ["RED ATEMIS SAS", "ATEMIS"]],
  ["Ville d'Ajaccio", ["Commune d'Ajaccio", "Mairie d'Ajaccio"]],
  ["Lyc\xE9e maritime de Bastia", []],
  ["SMILO", ["Association SMILO", "Small Islands Organisation"]],
  ["CPME", ["CGPME", "CPME Corsica", "Conf\xE9dration PME Corsica", "Conf\xE9d\xE9ration petites et moyennes entreprises"]],
  ["R\xE9gion Sud \u2013 Provence-Alpes-C\xF4te d'Azur", ["Conseil r\xE9gional PACA", "R\xE9gion PACA"]],
  ["M\xE9tropole Nice C\xF4te d'Azur", ["M\xE9tropole NCA"]],
  ["Office des transports de la Corse", ["Office des transport de la Corse"]],
  ["Conservatoire du littoral", []],
  ["Parc naturel r\xE9gional de Corse", ["PNRC"]]
];
var known = clientCatalog.flatMap(([name, aliases]) => [name, ...aliases].map((alias) => [nameKey(alias), name])).sort((a, b) => b[0].length - a[0].length);
function canonicalClientName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " "), key = nameKey(name);
  if (/^chambre de commerce(?: et (?:d )?industrie)? (?:(?:de|d) (?:la )?)?(?:corse|bastia|ajaccio|2a|2b)\b/.test(key) || /^chambre de commerce et industrie (?:daee|dcp|det|df|def|dpt|dpp)\b/.test(key)) return clientCatalog[0][0];
  if (/^chambre (?:regionale? )?(?:de|des) metiers\b/.test(key) && /\bcorse\b/.test(key)) return clientCatalog[1][0];
  for (const [alias, canonical] of known) if (key === alias || key.startsWith(alias + " ")) return canonical;
  return name;
}
var sameClientName = (left, right) => nameKey(canonicalClientName(left)) === nameKey(canonicalClientName(right));
var validClientName = (value) => !!nameKey(value) && !["annulee", "annule", "association", "strategiques"].includes(nameKey(value)) && !/^n a ne pas utiliser\b/.test(nameKey(value));
var agendaTypes = ["COPIL", "\xC9v\xE8nement", "R\xE9union projet", "Suivi client", "Formation", "Autre"];
var agendaTeam = ["quilici.pascal@cdinnov.com", "pasqualini.david@cdinnov.com", "boulanger.albert@cdinnov.com", "calendini.matthieu@cdinnov.com", "vincenti.paulmichel@cdinnov.com"];
var escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function agendaMembers(portal) {
  const allowed = new Set([...agendaTeam, ...portal?.auth?.allowed || []].map((e) => String(e).trim().toLowerCase()));
  return Object.entries(portal?.auth?.accounts || {}).filter(([email]) => allowed.has(email)).map(([email, account2]) => ({ email, name: account2.name || email }));
}
function agendaMail(trip, portal) {
  const allowed = new Set([...agendaTeam, ...portal?.auth?.allowed || []].map((e) => String(e).trim().toLowerCase()));
  const recipients = [...new Set([...agendaTeam, ...Object.keys(portal?.auth?.accounts || {})].map((e) => e.trim().toLowerCase()))].filter((e) => allowed.has(e) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const date = (v) => v.split("-").reverse().join("/");
  const names = trip.participants?.map((email) => portal?.auth?.accounts?.[email]?.name || email).join(" + ") || trip.ownerName;
  const rows = [["Consultants", names], ["Projets", trip.project], ["Objet", trip.type], ["Pr\xE9cision / \xE9v\xE9nement", trip.title || trip.event], ["D\xE9part", date(trip.start) + (trip.startTime ? " \xE0 " + trip.startTime : "")], ["Retour", date(trip.end) + (trip.endTime ? " \xE0 " + trip.endTime : "")], ["Dur\xE9e", trip.days + " jour" + (trip.days > 1 ? "s" : "") + " calendaires (d\xE9part et retour inclus)"], ["Lieu", trip.location], ["Clients", trip.client], ["Informations utiles", trip.notes]].filter(([, v]) => v);
  return { to: recipients.map((email) => ({ email })), subject: ("D\xE9placement \u2014 " + names + " \u2014 " + (trip.project || trip.title || trip.type) + " (" + trip.days + " j)").slice(0, 200), htmlContent: '<div style="font-family:Arial,sans-serif;color:#183f77;max-width:640px"><h2>Nouveau d\xE9placement</h2><p>Un d\xE9placement vient d\u2019\xEAtre ajout\xE9 \xE0 l\u2019Agenda partag\xE9 CDInnov.</p><table style="border-collapse:collapse;width:100%">' + rows.map(([k, v]) => '<tr><th style="text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #c9dcea">' + escapeHtml(k) + '</th><td style="padding:9px;border-bottom:1px solid #c9dcea;white-space:pre-wrap">' + escapeHtml(v) + "</td></tr>").join("") + '</table><p><a href="https://app.cdinnov.eu/?view=agenda">Consulter l\u2019Agenda partag\xE9</a></p></div>', textContent: "Nouveau d\xE9placement CDInnov\n\n" + rows.map(([k, v]) => k + " : " + v).join("\n") + "\n\nhttps://app.cdinnov.eu/?view=agenda" };
}
async function sendAgendaMail(db, id2, env, send = fetch) {
  const row = await db.prepare("UPDATE agenda_notifications SET status='sending',updated_at=? WHERE trip_id=? AND status IN ('pending','failed') RETURNING *").bind(Date.now(), id2).first();
  if (!row) return (await db.prepare("SELECT status FROM agenda_notifications WHERE trip_id=?").bind(id2).first())?.status || "none";
  let status = "failed";
  try {
    if (env.BREVO_API_KEY && env.NOTIFY_FROM) {
      const response = await send("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...JSON.parse(row.payload), sender: { email: env.NOTIFY_FROM, name: env.NOTIFY_FROM_NAME || "Gestion interne CDInnov" }, headers: { idempotencyKey: id2 } }), signal: AbortSignal.timeout(1e4) });
      if (response.ok) status = "sent";
      else {
        const body = await response.json().catch(() => ({}));
        status = body.code === "duplicate_parameter" ? "sent" : response.status >= 500 ? "unknown" : "failed";
      }
    }
  } catch {
    status = "unknown";
  }
  await db.prepare("UPDATE agenda_notifications SET status=?,updated_at=? WHERE trip_id=?").bind(status, Date.now(), id2).run();
  return status;
}
function dayNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp / 864e5 : NaN;
}
function validateTrip(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const limits = { title: 180, event: 180, location: 240, start: 10, end: 10, startTime: 5, endTime: 5, notes: 2e3 };
  const trip = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > max) return null;
    trip[key] = value.trim();
  }
  for (const [key, plural, max, count] of [["type", "types", 40, agendaTypes.length], ["project", "projects", 200, Infinity], ["client", "clients", 300, Infinity]]) {
    const values = input[plural] ?? (input[key] ? [input[key]] : []);
    if (!Array.isArray(values) || values.length > count || values.some((v) => typeof v !== "string" || v.length > max || !v.trim())) return null;
    trip[plural] = [...new Set(values.map((v) => v.trim()))];
    trip[key] = trip[plural].join(" + ");
  }
  if (input.participants !== void 0) {
    if (!Array.isArray(input.participants) || input.participants.some((v) => typeof v !== "string" || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))) return null;
    trip.participants = [...new Set(input.participants.map((v) => v.trim().toLowerCase()))];
  }
  const start = dayNumber(trip.start), end = dayNumber(trip.end);
  if (!trip.types.length || trip.types.some((v) => !agendaTypes.includes(v)) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  if (trip.start < "2000-01-01" || trip.end > "2100-12-31") return null;
  for (const time of [trip.startTime, trip.endTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (trip.start === trip.end && trip.startTime && trip.endTime && trip.endTime < trip.startTime) return null;
  trip.days = end - start + 1;
  return trip;
}
var unpack = (row) => ({ ...JSON.parse(row.payload), id: row.id, owner: row.owner, version: row.version, updatedAt: row.updated_at, notificationStatus: row.notification_status || "none" });
async function handleAgenda(request, db, email, admin, reply, jsonBody2, env) {
  const path = new URL(request.url).pathname;
  const notifying = path.endsWith("/notify");
  const id2 = path.slice("/budgets/agenda/".length).replace(/\/notify$/, "");
  const collection = path === "/budgets/agenda";
  if (!collection && !/^[a-zA-Z0-9_-]{1,80}$/.test(id2)) return reply(404, { error: "D\xE9placement introuvable." });
  if (collection && request.method === "GET") {
    const rows = await db.prepare("SELECT t.*,n.status AS notification_status FROM agenda_trips t LEFT JOIN agenda_notifications n ON n.trip_id=t.id ORDER BY t.updated_at DESC").all();
    const portal = await env.CET_KV.get(env.CET_WORKSPACE_KEY, "json");
    const leaves = { updatedAt: portal?.majAt || "", records: (portal?.conges || []).map(({ id: id22, matricule, date, half, type, statut, dateDebut, dateFin }) => ({ id: id22, matricule, date, half, type, statut, dateDebut, dateFin })), employees: (portal?.salaries || []).map(({ matricule, nom, prenom, email: email2 }) => ({ matricule, nom, prenom, email: email2 })) };
    return reply(200, { trips: rows.results.map(unpack), leaves, members: agendaMembers(portal) });
  }
  if (notifying) {
    if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
    const trip = await db.prepare("SELECT owner FROM agenda_trips WHERE id=?").bind(id2).first();
    if (!trip) return reply(404, { error: "D\xE9placement introuvable." });
    if (trip.owner !== email && !admin) return reply(403, { error: "Seul l\u2019auteur ou la direction peut relancer la notification." });
    return reply(200, { notificationStatus: await sendAgendaMail(db, id2, env) });
  }
  if (collection && request.method !== "POST" || !collection && !["PUT", "DELETE"].includes(request.method)) return reply(405, { error: "M\xE9thode non autoris\xE9e." });
  let current, version;
  if (!collection) {
    current = await db.prepare("SELECT * FROM agenda_trips WHERE id=?").bind(id2).first();
    if (!current) return reply(404, { error: "Ce d\xE9placement a \xE9t\xE9 supprim\xE9. Actualisez l\u2019agenda." });
    if (current.owner !== email && !admin) return reply(403, { error: "Seul l\u2019auteur ou la direction peut modifier ce d\xE9placement." });
    const raw = request.headers.get("if-match");
    if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return reply(428, { error: "Version du d\xE9placement requise." });
    version = Number(raw);
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  let saved;
  if (request.method === "DELETE") {
    saved = await db.prepare("DELETE FROM agenda_trips WHERE id=? AND version=? RETURNING id").bind(id2, version).first();
  } else {
    const trip = validateTrip(await jsonBody2(request, 64e3));
    if (!trip) return reply(400, { error: "V\xE9rifiez les s\xE9lections, l\u2019objet et les dates. Le retour doit suivre le d\xE9part." });
    const owner = current?.owner || email;
    const portal = await env.CET_KV.get(env.CET_WORKSPACE_KEY, "json");
    trip.ownerName = portal?.auth?.accounts?.[owner]?.name || owner;
    const previous = current ? JSON.parse(current.payload) : {};
    const participants = trip.participants ?? previous.participants ?? [owner];
    const members = new Set(agendaMembers(portal).map((m) => m.email));
    if (participants.some((p) => p !== owner && !members.has(p) && !previous.participants?.includes(p))) return reply(400, { error: "Choisissez les coll\xE8gues dans la liste de l\u2019\xE9quipe." });
    trip.participants = [.../* @__PURE__ */ new Set([owner, ...participants])];
    if (collection) {
      const tripId = crypto.randomUUID();
      const result = await db.batch([
        db.prepare("INSERT INTO agenda_trips (id,owner,payload,version,updated_at) VALUES (?,?,?,1,?) RETURNING *").bind(tripId, owner, JSON.stringify(trip), stamp),
        db.prepare("INSERT INTO agenda_notifications (trip_id,payload,status,updated_at) VALUES (?,?,'pending',?)").bind(tripId, JSON.stringify(agendaMail(trip, portal)), Date.now())
      ]);
      saved = result[0].results[0];
      try {
        saved.notification_status = await sendAgendaMail(db, tripId, env);
      } catch {
        saved.notification_status = "unknown";
      }
    } else {
      saved = await db.prepare("UPDATE agenda_trips SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING *").bind(JSON.stringify(trip), stamp, id2, version).first();
    }
  }
  if (!saved) return reply(409, { error: "Ce d\xE9placement a chang\xE9 depuis son ouverture. Votre saisie est conserv\xE9e : fermez la fiche et actualisez l\u2019agenda avant de reporter vos modifications." });
  if (request.method === "DELETE") await db.prepare("DELETE FROM agenda_notifications WHERE trip_id=?").bind(id2).run();
  return reply(collection ? 201 : 200, request.method === "DELETE" ? { deleted: true } : { trip: unpack(saved) });
}
var admins = ["quilici.pascal@cdinnov.com", "pasqualini.david@cdinnov.com", "boulanger.albert@cdinnov.com"];
var portalAccounts = [...admins, "calendini.matthieu@cdinnov.com", "vincenti.paulmichel@cdinnov.com"];
var normalize = (value) => String(value || "").trim().toLowerCase();
var empty = { demo: false, clients: [], projects: [], budgetLines: [], expenses: [], drs: [], imports: [] };
function addClientNames(clients, names) {
  const result = structuredClone(clients);
  for (const value of names) {
    const name = canonicalClientName(value);
    if (!validClientName(name)) continue;
    if (!result.some((client) => [client.name, ...client.aliases || []].some((alias) => sameClientName(alias, name)))) result.push({ id: crypto.randomUUID(), name, accounts: [], ...value !== name ? { aliases: [value] } : {} });
  }
  return result;
}
var equal = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
var fingerprint = (acc) => createHash("sha256").update(JSON.stringify([acc.salt, acc.iter, acc.hash])).digest("hex");
async function account(env, email) {
  const data = await env.CET_KV.get(env.CET_WORKSPACE_KEY, "json");
  const auth = data?.auth;
  if (!portalAccounts.includes(email) && !auth?.allowed?.map(normalize).includes(email)) return null;
  const acc = auth?.accounts?.[email];
  if (!acc || !/^[a-f0-9]{32}$/i.test(acc.salt) || !/^[a-f0-9]{64}$/i.test(acc.hash) || !Number.isInteger(acc.iter) || acc.iter < 1e5 || acc.iter > 1e6) return null;
  return acc;
}
function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
async function identity(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.length > 2e3) return null;
  const [body, sig, extra] = token.split(".");
  if (extra || !body || !sig || !equal(sign(body, env.BUDGETS_SESSION_SECRET), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (data.aud !== "cdinnov-budgets" || data.exp < Date.now() || typeof data.email !== "string") return null;
    const acc = await account(env, data.email);
    return acc && equal(data.fingerprint, fingerprint(acc)) ? data.email : null;
  } catch {
    return null;
  }
}
async function jsonBody(request, limit) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw Object.assign(new Error("Format JSON requis."), { status: 415 });
  let size = 0;
  const chunks = [];
  for await (const chunk of request.body || []) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Donn\xE9es trop volumineuses."), { status: 413 });
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Donn\xE9es JSON invalides."), { status: 400 });
  }
}
function validateWorkspace(ws) {
  if (!ws || typeof ws !== "object" || Array.isArray(ws) || typeof ws.demo !== "boolean") return false;
  for (const key of ["clients", "projects", "budgetLines", "expenses", "drs", "imports"]) {
    if (!Array.isArray(ws[key]) || ws[key].length > 1e4 || ws[key].some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) return false;
    if (new Set(ws[key].map((item) => item.id)).size !== ws[key].length) return false;
  }
  return true;
}
var worker_default = {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const allowed = (env.BUDGETS_ALLOWED_ORIGINS || "https://app.cdinnov.eu").split(",").map((x) => x.trim());
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    if (origin && allowed.includes(origin)) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, If-Match" });
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowed.includes(origin)) return reply(403, { error: "Origine non autoris\xE9e." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (!["/budgets/session", "/budgets/workspace", "/budgets/clients", "/budgets/agenda", "/budgets/markets"].includes(path) && !path.startsWith("/budgets/agenda/") && !path.startsWith("/budgets/markets/")) return reply(404, { error: "Introuvable." });
    if (!env.BUDGETS_DB || !env.CET_KV || !env.CET_WORKSPACE_KEY || String(env.BUDGETS_SESSION_SECRET || "").length < 32) return reply(503, { error: "Le service Budgets projets doit \xEAtre configur\xE9 avant sa premi\xE8re utilisation." });
    try {
      const db = env.BUDGETS_DB.withSession("first-primary");
      if (path === "/budgets/session") {
        if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
        const input = await jsonBody(request, 4096), email2 = normalize(input.email);
        if (!email2 || email2.length > 254 || !["challenge", "verify"].includes(input.action)) return reply(400, { error: "Identifiants invalides." });
        const now = Date.now();
        const limitKeys = ["email:" + email2, "ip:" + (request.headers.get("cf-connecting-ip") || "unknown")].map((v) => createHash("sha256").update(v).digest("hex"));
        if (input.action === "challenge") for (const key of limitKeys) {
          const limit = await db.prepare("INSERT INTO budgets_login_limits (id,attempts,until_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until_at<? THEN 1 ELSE attempts+1 END, until_at=CASE WHEN until_at<? THEN excluded.until_at ELSE until_at END RETURNING attempts").bind(key, now + 9e5, now, now).first();
          if (limit.attempts > 20) return reply(429, { error: "Trop de tentatives. R\xE9essayez dans 15 minutes." });
        }
        const acc = await account(env, email2);
        if (input.action === "challenge") {
          const body2 = Buffer.from(JSON.stringify({ aud: "cdinnov-budget-login", email: email2, exp: now + 6e4, fingerprint: acc ? fingerprint(acc) : randomBytes(32).toString("hex"), nonce: randomBytes(24).toString("hex") })).toString("base64url");
          return reply(200, { challenge: body2 + "." + sign(body2, env.BUDGETS_SESSION_SECRET), salt: acc?.salt || randomBytes(16).toString("hex"), iter: acc?.iter || 15e4 });
        }
        const denied = () => reply(401, { error: "Connexion CDInnov invalide ou expir\xE9e. Reconnectez-vous." });
        if (typeof input.challenge !== "string" || input.challenge.length > 2e3 || typeof input.proof !== "string" || !/^[a-f0-9]{64}$/.test(input.proof)) return denied();
        const [challengeBody, challengeSignature, extra] = input.challenge.split(".");
        if (extra || !challengeBody || !equal(sign(challengeBody, env.BUDGETS_SESSION_SECRET), challengeSignature)) return denied();
        let challenge;
        try {
          challenge = JSON.parse(Buffer.from(challengeBody, "base64url").toString());
        } catch {
          return denied();
        }
        if (challenge.aud !== "cdinnov-budget-login" || challenge.email !== email2 || challenge.exp < now || !acc || !equal(challenge.fingerprint, fingerprint(acc))) return denied();
        const consumed = await db.prepare("INSERT INTO budgets_login_challenges (nonce,expires_at) VALUES (?,?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce").bind(challenge.nonce, challenge.exp).first();
        if (!consumed) return denied();
        await db.prepare("DELETE FROM budgets_login_challenges WHERE expires_at<?").bind(now).run();
        const actual = createHmac("sha256", Buffer.from(acc.hash, "hex")).update(input.challenge).digest("hex");
        if (!equal(actual, input.proof)) return denied();
        const expiresAt = now + 8 * 60 * 60 * 1e3;
        const body = Buffer.from(JSON.stringify({ aud: "cdinnov-budgets", email: email2, exp: expiresAt, fingerprint: fingerprint(acc), nonce: randomBytes(16).toString("hex") })).toString("base64url");
        await db.prepare("DELETE FROM budgets_login_limits WHERE id=? OR until_at<?").bind(limitKeys[0], now).run();
        return reply(200, { token: body + "." + sign(body, env.BUDGETS_SESSION_SECRET), expiresAt });
      }
      const email = await identity(request, env);
      if (!email) return reply(401, { error: "Votre connexion CDInnov a expir\xE9. Reconnectez-vous \xE0 votre compte CDInnov." });
      if (path === "/budgets/markets" || path.startsWith("/budgets/markets/")) return await handleMarkets(request, db, email, admins.includes(email), reply, jsonBody, env);
      if (path === "/budgets/agenda" || path.startsWith("/budgets/agenda/")) return await handleAgenda(request, db, email, admins.includes(email), reply, jsonBody, env);
      if (path === "/budgets/clients") {
        if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
        const { names } = await jsonBody(request, 5e5);
        if (!Array.isArray(names) || names.length > 1e4 || names.some((name) => typeof name !== "string" || name.length > 300)) return reply(400, { error: "Liste de clients invalide." });
        for (let attempt = 0; attempt < 4; attempt++) {
          const before = await db.prepare("SELECT payload,version FROM budgets_workspace WHERE id='shared'").first();
          const workspace2 = before ? JSON.parse(before.payload) : structuredClone(empty), version2 = before?.version || 0;
          const clients = addClientNames(workspace2.clients, names);
          if (clients.length === workspace2.clients.length) return reply(200, { clients, version: version2 });
          workspace2.clients = clients;
          const payload2 = JSON.stringify(workspace2), stamp2 = (/* @__PURE__ */ new Date()).toISOString();
          if (Buffer.byteLength(payload2) > 15e5) return reply(413, { error: "Le r\xE9pertoire d\xE9passe la capacit\xE9 de cet espace. R\xE9duisez la taille des logos." });
          const saved = version2 === 0 ? await db.prepare("INSERT INTO budgets_workspace (id,payload,version,updated_at,updated_by) VALUES ('shared',?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING version").bind(payload2, stamp2, email).first() : await db.prepare("UPDATE budgets_workspace SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='shared' AND version=? RETURNING version").bind(payload2, stamp2, email, version2).first();
          if (saved) return reply(200, { clients, version: saved.version });
        }
        return reply(409, { error: "Le r\xE9pertoire est en cours de modification. R\xE9essayez." });
      }
      if (request.method === "GET") {
        const row2 = await db.prepare("SELECT payload,version,updated_at,updated_by FROM budgets_workspace WHERE id='shared'").first();
        return reply(200, { workspace: row2 ? JSON.parse(row2.payload) : empty, version: row2?.version || 0, updatedAt: row2?.updated_at, updatedBy: row2?.updated_by });
      }
      if (request.method !== "PUT") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
      const versionText = request.headers.get("if-match");
      if (!versionText || !/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) return reply(428, { error: "Version de sauvegarde requise." });
      const version = Number(versionText), workspace = await jsonBody(request, 15e5);
      if (!validateWorkspace(workspace)) return reply(400, { error: "Structure des budgets invalide." });
      const stamp = (/* @__PURE__ */ new Date()).toISOString(), payload = JSON.stringify(workspace);
      const row = version === 0 ? await db.prepare("INSERT INTO budgets_workspace (id,payload,version,updated_at,updated_by) VALUES ('shared',?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING version").bind(payload, stamp, email).first() : await db.prepare("UPDATE budgets_workspace SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='shared' AND version=? RETURNING version").bind(payload, stamp, email, version).first();
      if (!row) return reply(409, { error: "Un coll\xE8gue a enregistr\xE9 une nouvelle version. T\xE9l\xE9chargez votre copie, puis rechargez le budget partag\xE9 avant de reporter vos modifications." });
      return reply(200, { saved: true, version: row.version, updatedAt: stamp });
    } catch (error) {
      if (!error.status) console.error("Budget service:", error.name, error.message);
      return reply(error.status || 503, { error: error.status ? error.message : "Service Budgets projets indisponible. Vos modifications ne sont pas enregistr\xE9es." });
    }
  }
};

// work/deployment/worker/worker.js
var ALLOW_ORIGIN = "*";
function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-File-Name",
    "Access-Control-Max-Age": "86400"
  };
}
var MAX_FILE_BYTES = 20 * 1024 * 1024;
async function sendBrevo(env, subject, html, toOverride) {
  const toRaw = toOverride && String(toOverride).trim() ? String(toOverride) : env.NOTIFY_TO;
  if (!env.BREVO_API_KEY || !env.NOTIFY_FROM || !toRaw) {
    return { ok: false, error: "Configuration e-mail manquante (BREVO_API_KEY / NOTIFY_FROM / destinataire)." };
  }
  const to = String(toRaw).split(",").map((e) => ({ email: e.trim() })).filter((x) => x.email);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify({
      sender: { email: env.NOTIFY_FROM, name: env.NOTIFY_FROM_NAME || "Gestion interne CDInnov" },
      to,
      subject,
      htmlContent: html
    })
  });
  if (!r.ok) {
    const t = await r.text();
    return { ok: false, error: "Brevo " + r.status + ": " + t.slice(0, 300) };
  }
  return { ok: true };
}
var worker_default2 = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (path === "notify") {
      if (request.method !== "POST") return new Response("M\xE9thode non autoris\xE9e", { status: 405, headers: cors() });
      let body = {};
      try {
        body = await request.json();
      } catch (e) {
      }
      const subject = String(body.subject || "Notification \u2014 Gestion interne CDInnov").slice(0, 200);
      const html = body.html || "<p>" + String(body.text || "Notification") + "</p>";
      const res = await sendBrevo(env, subject, html, body.to);
      return new Response(JSON.stringify(res), { status: res.ok ? 200 : 500, headers: { ...cors(), "Content-Type": "application/json" } });
    }
    if (path.startsWith("files/")) {
      const fileKey = path.slice("files/".length);
      if (!fileKey) return new Response("Cl\xE9 de fichier manquante.", { status: 400, headers: cors() });
      if (!env.CET_FILES) return new Response("Binding R2 'CET_FILES' absent.", { status: 500, headers: cors() });
      if (request.method === "PUT") {
        const len = Number(request.headers.get("content-length") || 0);
        if (len && len > MAX_FILE_BYTES) {
          return new Response(JSON.stringify({ ok: false, error: "Fichier trop volumineux (max 20 Mo)." }), { status: 413, headers: { ...cors(), "Content-Type": "application/json" } });
        }
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        await env.CET_FILES.put(fileKey, request.body, { httpMetadata: { contentType } });
        return new Response(JSON.stringify({ ok: true, key: fileKey }), { headers: { ...cors(), "Content-Type": "application/json" } });
      }
      if (request.method === "GET") {
        const obj = await env.CET_FILES.get(fileKey);
        if (!obj) return new Response("Introuvable.", { status: 404, headers: cors() });
        const headers = { ...cors() };
        if (obj.httpMetadata && obj.httpMetadata.contentType) headers["Content-Type"] = obj.httpMetadata.contentType;
        return new Response(obj.body, { headers });
      }
      if (request.method === "DELETE") {
        await env.CET_FILES.delete(fileKey);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...cors(), "Content-Type": "application/json" } });
      }
      return new Response("M\xE9thode non autoris\xE9e.", { status: 405, headers: cors() });
    }
    const key = path;
    if (!key) return new Response("Cl\xE9 (UUID) manquante dans l'URL.", { status: 400, headers: cors() });
    if (!env.CET_KV) return new Response("Binding KV 'CET_KV' absent.", { status: 500, headers: cors() });
    if (request.method === "GET") {
      const data = await env.CET_KV.get(key);
      return new Response(data ?? "", { headers: { ...cors(), "Content-Type": "application/json; charset=utf-8" } });
    }
    if (request.method === "PUT" || request.method === "POST") {
      const b = await request.text();
      try {
        JSON.parse(b);
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), { status: 400, headers: { ...cors(), "Content-Type": "application/json" } });
      }
      await env.CET_KV.put(key, b);
      return new Response(JSON.stringify({ ok: true, bytes: b.length }), { headers: { ...cors(), "Content-Type": "application/json" } });
    }
    return new Response("M\xE9thode non autoris\xE9e.", { status: 405, headers: cors() });
  }
};

// work/deployment/worker/budget-entry.mjs
var budget_entry_default = { fetch(request, env, ctx) {
  return new URL(request.url).pathname.startsWith("/budgets/") ? worker_default.fetch(request, env, ctx) : worker_default2.fetch(request, env, ctx);
} };

// outputs/smartsheet-local/server/validation.mjs
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};
function check(condition, path, detail) {
  if (!condition) throw new ValidationError(`${path} : ${detail}`);
}
function object(value, path, required, optional = []) {
  check(value !== null && typeof value === "object" && !Array.isArray(value), path, "objet attendu");
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  for (const key of Object.keys(value)) check(allowed.has(key), `${path}.${key}`, "champ inconnu");
  for (const key of required) check(Object.hasOwn(value, key), `${path}.${key}`, "champ requis");
}
function string(value, path, max = 500, nonempty = false) {
  check(typeof value === "string" && value.length <= max && (!nonempty || value.trim().length > 0), path, `texte ${nonempty ? "non vide " : ""}de ${max} caract\xE8res maximum attendu`);
}
function id(value, path) {
  string(value, path, 128, true);
}
function bool(value, path) {
  check(typeof value === "boolean", path, "bool\xE9en attendu");
}
function array(value, path, max) {
  check(Array.isArray(value) && value.length <= max, path, `liste de ${max} \xE9l\xE9ments maximum attendue`);
}
function number(value, path, min = -1e15, max = 1e15) {
  check(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, path, `nombre entre ${min} et ${max} attendu`);
}
function timestamp(value, path) {
  string(value, path, 40, true);
  check(/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), path, "date ISO attendue");
}
function color(value, path) {
  string(value, path, 80);
  check(/^(#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value), path, "couleur simple attendue");
}
function uniqueIds(values, path) {
  const set = /* @__PURE__ */ new Set();
  for (let i = 0; i < values.length; i += 1) {
    id(values[i]?.id, `${path}[${i}].id`);
    check(!set.has(values[i].id), `${path}[${i}].id`, "identifiant d\xE9j\xE0 utilis\xE9");
    set.add(values[i].id);
  }
  return set;
}
function validateWidgets(widgets, path) {
  array(widgets, path, 100);
  uniqueIds(widgets, path);
  widgets.forEach((widget, i) => {
    const p = `${path}[${i}]`;
    object(widget, p, ["id", "type"], ["title", "metric", "chart", "mode", "content", "background", "titleColor", "textColor", "textAlign"]);
    if (widget.title !== void 0) string(widget.title, `${p}.title`, 500);
    check(["metric", "chart", "tasks", "text"].includes(widget.type), `${p}.type`, "type de widget inconnu");
    if (widget.type === "metric") check(["total", "progress", "overdue", "budget", "completed"].includes(widget.metric), `${p}.metric`, "indicateur inconnu");
    if (widget.type === "chart") check(["status", "progress"].includes(widget.chart), `${p}.chart`, "graphique inconnu");
    if (widget.type === "tasks") check(["due", "recent"].includes(widget.mode), `${p}.mode`, "mode inconnu");
    if (widget.type === "text") string(widget.content, `${p}.content`, 5e4);
    if (widget.metric !== void 0) check(["total", "progress", "overdue", "budget", "completed"].includes(widget.metric), `${p}.metric`, "indicateur inconnu");
    if (widget.chart !== void 0) check(["status", "progress"].includes(widget.chart), `${p}.chart`, "graphique inconnu");
    if (widget.mode !== void 0) check(["due", "recent"].includes(widget.mode), `${p}.mode`, "mode inconnu");
    if (widget.content !== void 0) string(widget.content, `${p}.content`, 5e4);
    for (const key of ["background", "titleColor", "textColor"]) if (widget[key] !== void 0) color(widget[key], `${p}.${key}`);
    if (widget.textAlign !== void 0) check(["left", "center", "right"].includes(widget.textAlign), `${p}.textAlign`, "alignement inconnu");
  });
}
function jsonExtension(value, path, depth = 0, counter = { count: 0 }) {
  check(depth <= 8 && ++counter.count <= 5e3, path, "r\xE8gle trop complexe");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") return number(value, path);
  if (typeof value === "string") return string(value, path, 2e4);
  if (Array.isArray(value)) {
    array(value, path, 200);
    value.forEach((child, i) => jsonExtension(child, `${path}[${i}]`, depth + 1, counter));
    return;
  }
  check(typeof value === "object", path, "valeur JSON attendue");
  check(Object.keys(value).length <= 100, path, "trop de propri\xE9t\xE9s");
  for (const [key, child] of Object.entries(value)) {
    check(!["__proto__", "prototype", "constructor"].includes(key), path, "propri\xE9t\xE9 r\xE9serv\xE9e");
    string(key, path, 128, true);
    jsonExtension(child, `${path}.${key}`, depth + 1, counter);
  }
}
function validateState(state) {
  object(state, "state", ["version", "profile", "workspaces", "sheets", "dashboards", "activity"], ["sampleData"]);
  check(state.version === 1, "state.version", "version 1 requise");
  if (state.sampleData !== void 0) bool(state.sampleData, "state.sampleData");
  object(state.profile, "state.profile", ["name", "organization"]);
  string(state.profile.name, "state.profile.name", 200, true);
  string(state.profile.organization, "state.profile.organization", 300);
  array(state.workspaces, "state.workspaces", 200);
  array(state.sheets, "state.sheets", 500);
  array(state.dashboards, "state.dashboards", 500);
  array(state.activity, "state.activity", 5e3);
  const workspaceIds = uniqueIds(state.workspaces, "state.workspaces");
  const sheetIds = uniqueIds(state.sheets, "state.sheets");
  uniqueIds(state.dashboards, "state.dashboards");
  uniqueIds(state.activity, "state.activity");
  const workspaceFolders = /* @__PURE__ */ new Map();
  state.workspaces.forEach((workspace, index) => {
    const p = `state.workspaces[${index}]`;
    object(workspace, p, ["id", "name", "folders"]);
    string(workspace.name, `${p}.name`, 300, true);
    array(workspace.folders, `${p}.folders`, 500);
    workspaceFolders.set(workspace.id, uniqueIds(workspace.folders, `${p}.folders`));
    workspace.folders.forEach((folder, i) => {
      object(folder, `${p}.folders[${i}]`, ["id", "name"]);
      string(folder.name, `${p}.folders[${i}].name`, 300, true);
    });
  });
  let totalRows = 0;
  state.sheets.forEach((sheet, index) => {
    const p = `state.sheets[${index}]`;
    object(sheet, p, ["id", "name", "workspaceId", "folderId", "favorite", "columns", "rows", "comments", "forms", "automations", "lastView", "createdAt", "updatedAt"]);
    string(sheet.name, `${p}.name`, 300, true);
    check(workspaceIds.has(sheet.workspaceId), `${p}.workspaceId`, "espace de travail introuvable");
    check(sheet.folderId === null || workspaceFolders.get(sheet.workspaceId).has(sheet.folderId), `${p}.folderId`, "dossier introuvable dans cet espace");
    bool(sheet.favorite, `${p}.favorite`);
    check(["grid", "gantt", "card", "cards", "calendar"].includes(sheet.lastView), `${p}.lastView`, "vue inconnue");
    timestamp(sheet.createdAt, `${p}.createdAt`);
    timestamp(sheet.updatedAt, `${p}.updatedAt`);
    array(sheet.columns, `${p}.columns`, 100);
    check(sheet.columns.length > 0, `${p}.columns`, "au moins une colonne est n\xE9cessaire");
    const columnIds = uniqueIds(sheet.columns, `${p}.columns`);
    const columns = new Map(sheet.columns.map((column) => [column.id, column]));
    sheet.columns.forEach((column, i) => {
      const cp = `${p}.columns[${i}]`;
      object(column, cp, ["id", "title", "type", "width"], ["options"]);
      string(column.title, `${cp}.title`, 300, true);
      check(["text", "number", "date", "select", "checkbox", "contact"].includes(column.type), `${cp}.type`, "type de colonne inconnu");
      number(column.width, `${cp}.width`, 40, 2e3);
      if (column.options !== void 0) {
        array(column.options, `${cp}.options`, 500);
        column.options.forEach((option, oi) => string(option, `${cp}.options[${oi}]`, 500));
      }
    });
    array(sheet.rows, `${p}.rows`, 2e4);
    totalRows += sheet.rows.length;
    check(totalRows <= 5e4, "state.sheets", "limite globale de 50 000 lignes atteinte");
    const rowIds = uniqueIds(sheet.rows, `${p}.rows`);
    const rows = new Map(sheet.rows.map((row) => [row.id, row]));
    sheet.rows.forEach((row, i) => {
      const rp = `${p}.rows[${i}]`;
      object(row, rp, ["id", "parentId", "cells"], ["format"]);
      check(row.parentId === null || rowIds.has(row.parentId) && row.parentId !== row.id, `${rp}.parentId`, "parent invalide");
      object(row.cells, `${rp}.cells`, [], [...columnIds]);
      for (const [key, value] of Object.entries(row.cells)) {
        const cp = `${rp}.cells.${key}`;
        const type = columns.get(key).type;
        check(["string", "number", "boolean"].includes(typeof value), cp, "texte, nombre ou bool\xE9en attendu");
        if (typeof value === "string") string(value, cp, 1e5);
        if (typeof value === "number") number(value, cp);
        if (typeof value === "string" && value.startsWith("=")) {
          string(value, cp, 1e4);
          continue;
        }
        if (value !== "") {
          if (type === "number") number(value, cp);
          else if (type === "checkbox") bool(value, cp);
          else string(value, cp, 1e5);
        }
        if (key === "progress" && type === "number" && value !== "") number(value, cp, 0, 100);
        if (type === "date" && value !== "") {
          check(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, cp, "date valide AAAA-MM-JJ attendue");
        }
      }
      if (row.format !== void 0) {
        object(row.format, `${rp}.format`, [], ["background", "color", "bold", "italic", "underline"]);
        for (const key of ["background", "color"]) if (row.format[key] !== void 0) color(row.format[key], `${rp}.format.${key}`);
        for (const key of ["bold", "italic", "underline"]) if (row.format[key] !== void 0) bool(row.format[key], `${rp}.format.${key}`);
      }
    });
    const checkedParents = /* @__PURE__ */ new Set();
    for (const row of sheet.rows) {
      const chain = /* @__PURE__ */ new Set();
      let next = row;
      while (next && !checkedParents.has(next.id)) {
        check(!chain.has(next.id), `${p}.rows`, "cycle de hi\xE9rarchie d\xE9tect\xE9");
        chain.add(next.id);
        next = next.parentId === null ? null : rows.get(next.parentId);
      }
      for (const item of chain) checkedParents.add(item);
    }
    array(sheet.comments, `${p}.comments`, 5e3);
    uniqueIds(sheet.comments, `${p}.comments`);
    sheet.comments.forEach((comment, i) => {
      const cp = `${p}.comments[${i}]`;
      object(comment, cp, ["id", "rowId", "text", "author", "createdAt"]);
      check(comment.rowId === null || rowIds.has(comment.rowId), `${cp}.rowId`, "ligne introuvable");
      string(comment.text, `${cp}.text`, 2e4, true);
      string(comment.author, `${cp}.author`, 300, true);
      timestamp(comment.createdAt, `${cp}.createdAt`);
    });
    array(sheet.forms, `${p}.forms`, 100);
    uniqueIds(sheet.forms, `${p}.forms`);
    sheet.forms.forEach((form, i) => {
      const fp = `${p}.forms[${i}]`;
      object(form, fp, ["id", "title", "description", "fields", "active"], ["successMessage"]);
      string(form.title, `${fp}.title`, 500, true);
      string(form.description, `${fp}.description`, 2e4);
      if (form.successMessage !== void 0) string(form.successMessage, `${fp}.successMessage`, 2e4);
      bool(form.active, `${fp}.active`);
      array(form.fields, `${fp}.fields`, 100);
      const formColumns = /* @__PURE__ */ new Set();
      form.fields.forEach((field, fi) => {
        const fip = `${fp}.fields[${fi}]`;
        object(field, fip, ["columnId", "label", "required"], ["hidden", "placeholder", "description"]);
        check(columnIds.has(field.columnId) && !formColumns.has(field.columnId), `${fip}.columnId`, "colonne introuvable ou d\xE9j\xE0 utilis\xE9e");
        formColumns.add(field.columnId);
        string(field.label, `${fip}.label`, 500, true);
        bool(field.required, `${fip}.required`);
        if (field.hidden !== void 0) bool(field.hidden, `${fip}.hidden`);
        if (field.placeholder !== void 0) string(field.placeholder, `${fip}.placeholder`, 1e3);
        if (field.description !== void 0) string(field.description, `${fip}.description`, 5e3);
      });
    });
    array(sheet.automations, `${p}.automations`, 100);
    uniqueIds(sheet.automations, `${p}.automations`);
    sheet.automations.forEach((automation, i) => {
      check(automation !== null && !Array.isArray(automation) && typeof automation === "object", `${p}.automations[${i}]`, "objet attendu");
      jsonExtension(automation, `${p}.automations[${i}]`);
    });
  });
  state.dashboards.forEach((dashboard, index) => {
    const p = `state.dashboards[${index}]`;
    object(dashboard, p, ["id", "name", "workspaceId", "sheetIds", "favorite", "widgets"], ["widgetsConfigured"]);
    string(dashboard.name, `${p}.name`, 300, true);
    check(workspaceIds.has(dashboard.workspaceId), `${p}.workspaceId`, "espace de travail introuvable");
    bool(dashboard.favorite, `${p}.favorite`);
    if (dashboard.widgetsConfigured !== void 0) bool(dashboard.widgetsConfigured, `${p}.widgetsConfigured`);
    array(dashboard.sheetIds, `${p}.sheetIds`, 500);
    check(new Set(dashboard.sheetIds).size === dashboard.sheetIds.length, `${p}.sheetIds`, "feuilles en double");
    dashboard.sheetIds.forEach((sheetId, i) => check(sheetIds.has(sheetId), `${p}.sheetIds[${i}]`, "feuille introuvable"));
    validateWidgets(dashboard.widgets, `${p}.widgets`);
  });
  state.activity.forEach((activity, index) => {
    const p = `state.activity[${index}]`;
    object(activity, p, ["id", "text", "createdAt"]);
    string(activity.text, `${p}.text`, 2e3, true);
    timestamp(activity.createdAt, `${p}.createdAt`);
  });
  return state;
}
function validateEnvelope(body) {
  object(body, "body", ["state", "revision"]);
  check(Number.isSafeInteger(body.revision) && body.revision >= 1, "body.revision", "r\xE9vision enti\xE8re positive attendue");
  validateState(body.state);
  return body;
}

// outputs/smartsheet-local/deployment/sheets-worker.mjs
var emptyState = () => ({ version: 1, sampleData: false, profile: { name: "\xC9quipe", organization: "CD Innovation" }, workspaces: [], sheets: [], dashboards: [], activity: [] });
var MAX_BYTES = 15e5;
function createSheetsHandler(identity2) {
  return async function handleSheets(request, env) {
    const origin = request.headers.get("Origin");
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    if (origin === "https://app.cdinnov.eu") Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, PUT, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
    const reply = (status, value) => new Response(JSON.stringify(value), { status, headers });
    if (origin && origin !== "https://app.cdinnov.eu") return reply(403, { error: "Origine non autoris\xE9e." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (!["/sheets/state", "/sheets/session"].includes(path)) return reply(404, { error: "Introuvable." });
    try {
      const email = await identity2(request, env);
      if (!email) return reply(401, { error: "Votre connexion CDInnov a expir\xE9. Reconnectez-vous." });
      if (path === "/sheets/session") return request.method === "GET" ? reply(200, { email }) : reply(405, { error: "M\xE9thode non autoris\xE9e." });
      const db = env.BUDGETS_DB.withSession("first-primary");
      if (request.method === "GET") {
        const row = await db.prepare("SELECT payload,revision,updated_at,updated_by FROM cdinnov_sheets_workspace WHERE id='shared'").first();
        return reply(200, { state: row ? JSON.parse(row.payload) : emptyState(), revision: row?.revision || 1, updatedAt: row?.updated_at, updatedBy: row?.updated_by });
      }
      if (request.method !== "PUT") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) return reply(415, { error: "Format JSON requis." });
      const chunks = [];
      let size = 0;
      for await (const chunk of request.body || []) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) return reply(413, { error: "Cet espace d\xE9passe 1,5 Mo. Exportez une sauvegarde et r\xE9duisez son contenu." });
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return reply(400, { error: "JSON invalide." });
      }
      validateEnvelope(body);
      const payload = JSON.stringify(body.state), stamp = (/* @__PURE__ */ new Date()).toISOString();
      const saved = await db.prepare("INSERT INTO cdinnov_sheets_workspace (id,payload,revision,updated_at,updated_by) SELECT 'shared',?,2,?,? WHERE ?=1 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, revision=cdinnov_sheets_workspace.revision+1, updated_at=excluded.updated_at, updated_by=excluded.updated_by WHERE cdinnov_sheets_workspace.revision=? RETURNING revision").bind(payload, stamp, email, body.revision, body.revision).first();
      const updated = saved || (body.revision > 1 ? await db.prepare("UPDATE cdinnov_sheets_workspace SET payload=?,revision=revision+1,updated_at=?,updated_by=? WHERE id='shared' AND revision=? RETURNING revision").bind(payload, stamp, email, body.revision).first() : null);
      if (!updated) return reply(409, { error: "Un coll\xE8gue a modifi\xE9 les donn\xE9es. Exportez votre copie avant de recharger." });
      return reply(200, { ok: true, revision: updated.revision });
    } catch (error) {
      if (error instanceof ValidationError) return reply(400, { error: error.message });
      return reply(503, { error: "La sauvegarde en ligne est indisponible. Votre copie reste ouverte ; exportez-la avant de quitter." });
    }
  };
}

// work/deployment/worker/entry.mjs
var sheets = createSheetsHandler(identity);
var entry_default = { fetch(request, env, ctx) {
  return new URL(request.url).pathname.startsWith("/sheets/") ? sheets(request, env) : budget_entry_default.fetch(request, env, ctx);
} };
export {
  entry_default as default
};

export {identity, addClientNames, jsonBody};
