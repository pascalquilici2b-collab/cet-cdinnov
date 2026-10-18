// server/budget-service-source.mjs
import { timingSafeEqual, createHash as createHash2, createHmac, randomBytes } from "node:crypto";
import { Buffer as Buffer2 } from "node:buffer";

// server/client-names.mjs
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
  const name = String(value || "").trim().replace(/\s+/g, " "), key2 = nameKey(name);
  if (/^chambre de commerce(?: et (?:d )?industrie)? (?:(?:de|d) (?:la )?)?(?:corse|bastia|ajaccio|2a|2b)\b/.test(key2) || /^chambre de commerce et industrie (?:daee|dcp|det|df|def|dpt|dpp)\b/.test(key2)) return clientCatalog[0][0];
  if (/^chambre (?:regionale? )?(?:de|des) metiers\b/.test(key2) && /\bcorse\b/.test(key2)) return clientCatalog[1][0];
  for (const [alias, canonical] of known) if (key2 === alias || key2.startsWith(alias + " ")) return canonical;
  return name;
}
var sameClientName = (left, right) => nameKey(canonicalClientName(left)) === nameKey(canonicalClientName(right));
var validClientName = (value) => !!nameKey(value) && !["annulee", "annule", "association", "strategiques"].includes(nameKey(value)) && !/^n a ne pas utiliser\b/.test(nameKey(value));

// server/agenda-worker.mjs
var agendaSchema = `CREATE TABLE IF NOT EXISTS agenda_trips (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL,
  version INTEGER NOT NULL, updated_at TEXT NOT NULL
)`;
var agendaTypes = ["COPIL", "\xC9v\xE8nement", "R\xE9union projet", "Suivi client", "Formation", "Autre"];
var agendaNotifySchema = `CREATE TABLE IF NOT EXISTS agenda_notifications (
  trip_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL
)`;
var agendaTeam = ["quilici.pascal@cdinnov.com", "pasqualini.david@cdinnov.com", "boulanger.albert@cdinnov.com", "calendini.matthieu@cdinnov.com", "vincenti.paulmichel@cdinnov.com"];
var escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function agendaMembers(portal) {
  const allowed = new Set([...agendaTeam, ...portal?.auth?.allowed || []].map((e) => String(e).trim().toLowerCase()));
  return Object.entries(portal?.auth?.accounts || {}).filter(([email]) => allowed.has(email)).map(([email, account2]) => ({ email, name: account2.name || email }));
}
function agendaMail(trip, portal) {
  const allowed = new Set([...agendaTeam, ...portal?.auth?.allowed || []].map((e) => String(e).trim().toLowerCase()));
  const recipients = [...new Set([...agendaTeam, ...Object.keys(portal?.auth?.accounts || {})].map((e) => e.trim().toLowerCase()))].filter((e) => allowed.has(e) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const date2 = (v) => v.split("-").reverse().join("/");
  const names = trip.participants?.map((email) => portal?.auth?.accounts?.[email]?.name || email).join(" + ") || trip.ownerName;
  const rows = [["Consultants", names], ["Projets", trip.project], ["Objet", trip.type], ["Pr\xE9cision / \xE9v\xE9nement", trip.title || trip.event], ["D\xE9part", date2(trip.start) + (trip.startTime ? " \xE0 " + trip.startTime : "")], ["Retour", date2(trip.end) + (trip.endTime ? " \xE0 " + trip.endTime : "")], ["Dur\xE9e", trip.days + " jour" + (trip.days > 1 ? "s" : "") + " calendaires (d\xE9part et retour inclus)"], ["Lieu", trip.location], ["Clients", trip.client], ["Informations utiles", trip.notes]].filter(([, v]) => v);
  return { to: recipients.map((email) => ({ email })), subject: ("D\xE9placement \u2014 " + names + " \u2014 " + (trip.project || trip.title || trip.type) + " (" + trip.days + " j)").slice(0, 200), htmlContent: '<div style="font-family:Arial,sans-serif;color:#183f77;max-width:640px"><h2>Nouveau d\xE9placement</h2><p>Un d\xE9placement vient d\u2019\xEAtre ajout\xE9 \xE0 l\u2019Agenda partag\xE9 CDInnov.</p><table style="border-collapse:collapse;width:100%">' + rows.map(([k, v]) => '<tr><th style="text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #c9dcea">' + escapeHtml(k) + '</th><td style="padding:9px;border-bottom:1px solid #c9dcea;white-space:pre-wrap">' + escapeHtml(v) + "</td></tr>").join("") + '</table><p><a href="https://app.cdinnov.eu/?view=agenda">Consulter l\u2019Agenda partag\xE9</a></p></div>', textContent: "Nouveau d\xE9placement CDInnov\n\n" + rows.map(([k, v]) => k + " : " + v).join("\n") + "\n\nhttps://app.cdinnov.eu/?view=agenda" };
}
async function sendAgendaMail(db, id, env, send = fetch) {
  const row = await db.prepare("UPDATE agenda_notifications SET status='sending',updated_at=? WHERE trip_id=? AND status IN ('pending','failed') RETURNING *").bind(Date.now(), id).first();
  if (!row) return (await db.prepare("SELECT status FROM agenda_notifications WHERE trip_id=?").bind(id).first())?.status || "none";
  let status = "failed";
  try {
    if (env.BREVO_API_KEY && env.NOTIFY_FROM) {
      const response = await send("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" }, body: JSON.stringify({ ...JSON.parse(row.payload), sender: { email: env.NOTIFY_FROM, name: env.NOTIFY_FROM_NAME || "Gestion interne CDInnov" }, headers: { idempotencyKey: id } }), signal: AbortSignal.timeout(1e4) });
      if (response.ok) status = "sent";
      else {
        const body = await response.json().catch(() => ({}));
        status = body.code === "duplicate_parameter" ? "sent" : response.status >= 500 ? "unknown" : "failed";
      }
    }
  } catch {
    status = "unknown";
  }
  await db.prepare("UPDATE agenda_notifications SET status=?,updated_at=? WHERE trip_id=?").bind(status, Date.now(), id).run();
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
  for (const [key2, max] of Object.entries(limits)) {
    const value = input[key2] ?? "";
    if (typeof value !== "string" || value.length > max) return null;
    trip[key2] = value.trim();
  }
  for (const [key2, plural, max, count] of [["type", "types", 40, agendaTypes.length], ["project", "projects", 200, Infinity], ["client", "clients", 300, Infinity]]) {
    const values = input[plural] ?? (input[key2] ? [input[key2]] : []);
    if (!Array.isArray(values) || values.length > count || values.some((v) => typeof v !== "string" || v.length > max || !v.trim())) return null;
    trip[plural] = [...new Set(values.map((v) => v.trim()))];
    trip[key2] = trip[plural].join(" + ");
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
  const id = path.slice("/budgets/agenda/".length).replace(/\/notify$/, "");
  const collection = path === "/budgets/agenda";
  if (!collection && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return reply(404, { error: "D\xE9placement introuvable." });
  if (collection && request.method === "GET") {
    const rows = await db.prepare("SELECT t.*,n.status AS notification_status FROM agenda_trips t LEFT JOIN agenda_notifications n ON n.trip_id=t.id ORDER BY t.updated_at DESC").all();
    const portal = await env.CET_KV.get(env.CET_WORKSPACE_KEY, "json");
    const leaves = { updatedAt: portal?.majAt || "", records: (portal?.conges || []).map(({ id: id2, matricule, date: date2, half, type, statut, dateDebut, dateFin }) => ({ id: id2, matricule, date: date2, half, type, statut, dateDebut, dateFin })), employees: (portal?.salaries || []).map(({ matricule, nom, prenom, email: email2 }) => ({ matricule, nom, prenom, email: email2 })) };
    return reply(200, { trips: rows.results.map(unpack), leaves, members: agendaMembers(portal) });
  }
  if (notifying) {
    if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
    const trip = await db.prepare("SELECT owner FROM agenda_trips WHERE id=?").bind(id).first();
    if (!trip) return reply(404, { error: "D\xE9placement introuvable." });
    if (trip.owner !== email && !admin) return reply(403, { error: "Seul l\u2019auteur ou la direction peut relancer la notification." });
    return reply(200, { notificationStatus: await sendAgendaMail(db, id, env) });
  }
  if (collection && request.method !== "POST" || !collection && !["PUT", "DELETE"].includes(request.method)) return reply(405, { error: "M\xE9thode non autoris\xE9e." });
  let current, version;
  if (!collection) {
    current = await db.prepare("SELECT * FROM agenda_trips WHERE id=?").bind(id).first();
    if (!current) return reply(404, { error: "Ce d\xE9placement a \xE9t\xE9 supprim\xE9. Actualisez l\u2019agenda." });
    if (current.owner !== email && !admin) return reply(403, { error: "Seul l\u2019auteur ou la direction peut modifier ce d\xE9placement." });
    const raw = request.headers.get("if-match");
    if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return reply(428, { error: "Version du d\xE9placement requise." });
    version = Number(raw);
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  let saved;
  if (request.method === "DELETE") {
    saved = await db.prepare("DELETE FROM agenda_trips WHERE id=? AND version=? RETURNING id").bind(id, version).first();
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
      saved = await db.prepare("UPDATE agenda_trips SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING *").bind(JSON.stringify(trip), stamp, id, version).first();
    }
  }
  if (!saved) return reply(409, { error: "Ce d\xE9placement a chang\xE9 depuis son ouverture. Votre saisie est conserv\xE9e : fermez la fiche et actualisez l\u2019agenda avant de reporter vos modifications." });
  if (request.method === "DELETE") await db.prepare("DELETE FROM agenda_notifications WHERE trip_id=?").bind(id).run();
  return reply(collection ? 201 : 200, request.method === "DELETE" ? { deleted: true } : { trip: unpack(saved) });
}

// marches/worker.mjs
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

// marches/domain.mjs
var TYPES = { framework: "Accord-cadre \xE0 bons de commande", fixed: "March\xE9 forfaitaire", quote: "Devis accept\xE9", mixed: "March\xE9 mixte" };
var UNITS = { day: "Jour", hour: "Heure", flat: "Forfait", unit: "Unit\xE9" };
var BILLING = { actual: "Au r\xE9el", fixed: "Forfait", milestone: "Jalon", schedule: "\xC9ch\xE9ancier", mixed: "Mixte" };
function minor(value) {
  if (value === "" || value === null || value === void 0) return null;
  const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) throw new Error("Montant positif avec deux d\xE9cimales maximum requis.");
  const [a, b = ""] = s.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Montant trop \xE9lev\xE9.");
  return n;
}
var dateValid = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && (/* @__PURE__ */ new Date(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;
var key = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
var overlaps = (a, b) => (a.startDate || "0000") <= (b.endDate || "9999") && (b.startDate || "0000") <= (a.endDate || "9999");
function text(v, label, max = 500, required = false) {
  if (v == null) v = "";
  if (typeof v !== "string" || v.length > max || required && !v.trim()) throw new Error(label + " : valeur manquante ou trop longue.");
  return v.trim();
}
function choice(v, choices, label) {
  if (!choices.includes(v)) throw new Error(label + " : valeur invalide.");
  return v;
}
function amount(v, label) {
  if (v === null) return null;
  if (!Number.isSafeInteger(v) || v < 0 || v > 999999999999) throw new Error(label + " : montant invalide.");
  return v;
}
function date(v, label) {
  const s = text(v, label, 10);
  if (s && !dateValid(s)) throw new Error(label + " : date invalide.");
  return s;
}
function source(v = {}) {
  return { documentId: text(v?.documentId, "Pi\xE8ce source", 80), locator: text(v?.locator, "Page ou article", 120), note: text(v?.note, "Note de lecture", 1500) };
}
function common(v, documentIds) {
  const r = { id: text(v?.id, "Identifiant", 80, true), status: choice(v?.status, ["proposed", "validated"], "Validation"), source: source(v?.source) };
  if (!/^[a-zA-Z0-9_-]+$/.test(r.id)) throw new Error("Identifiant invalide.");
  if (r.source.documentId && !documentIds.has(r.source.documentId)) throw new Error("La pi\xE8ce source ne fait pas partie de ce march\xE9.");
  if (r.status === "validated" && (!r.source.documentId || !r.source.locator)) throw new Error("Pour valider une r\xE8gle, rattachez sa pi\xE8ce source et sa page ou son article.");
  return r;
}
function validateMarket(input, documents = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Fiche de march\xE9 invalide.");
  const ids = new Set(documents.map((d) => d.id));
  const m = {
    title: text(input.title, "Objet du march\xE9", 240, true),
    reference: text(input.reference, "R\xE9f\xE9rence", 120),
    clientName: text(input.clientName, "Client contractant", 240, true),
    clientId: text(input.clientId, "Client", 80),
    type: choice(input.type, Object.keys(TYPES), "Type de march\xE9"),
    currency: choice(input.currency, ["EUR"], "Devise"),
    status: choice(input.status, ["draft", "validated", "archived"], "\xC9tat du march\xE9"),
    billingMode: choice(input.billingMode, Object.keys(BILLING), "Facturation"),
    notificationDate: date(input.notificationDate, "Date port\xE9e sur la notification"),
    periodBasis: choice(input.periodBasis, ["unknown", "notification", "calendar", "custom"], "P\xE9riodes"),
    renewalMode: choice(input.renewalMode, ["unknown", "none", "tacit", "express"], "Reconduction"),
    renewalCount: input.renewalCount === null ? null : Number(input.renewalCount),
    noMinimum: input.noMinimum === true,
    minimumMinor: amount(input.minimumMinor, "Minimum"),
    feesIncluded: input.feesIncluded === true,
    notes: text(input.notes, "Notes", 6e3)
  };
  if (m.renewalCount !== null && (!Number.isInteger(m.renewalCount) || m.renewalCount < 0 || m.renewalCount > 20)) throw new Error("Nombre de reconductions invalide.");
  if (m.noMinimum && m.minimumMinor !== null) throw new Error("Le march\xE9 sans minimum ne peut pas avoir un montant minimum.");
  for (const list of ["prices", "ceilings", "periods", "issues"]) {
    if (!Array.isArray(input[list]) || input[list].length > 150) throw new Error("Liste " + list + " invalide ou trop longue.");
    if (new Set(input[list].map((x) => x?.id)).size !== input[list].length) throw new Error("Identifiants en double dans " + list + ".");
  }
  m.periods = input.periods.map((v) => {
    const r = { ...common(v, ids), label: text(v.label, "P\xE9riode", 180, true), startDate: date(v.startDate, "D\xE9but de p\xE9riode"), endDate: date(v.endDate, "Fin de p\xE9riode"), decision: text(v.decision, "D\xE9cision de p\xE9riode", 1500) };
    if (r.startDate && r.endDate && r.endDate < r.startDate) throw new Error("La fin de p\xE9riode pr\xE9c\xE8de son d\xE9but.");
    if (r.status === "validated" && (!r.startDate || !r.endDate || !r.decision)) throw new Error("Une p\xE9riode valid\xE9e exige ses deux dates et la justification de sa prise d\u2019effet.");
    return r;
  });
  for (let i = 0; i < m.periods.length; i++) for (let j = i + 1; j < m.periods.length; j++) {
    if (m.periods[i].status === "validated" && m.periods[j].status === "validated" && overlaps(m.periods[i], m.periods[j])) throw new Error("Deux p\xE9riodes contractuelles valid\xE9es se chevauchent.");
  }
  m.prices = input.prices.map((v) => {
    const r = { ...common(v, ids), label: text(v.label, "Prestation", 240, true), profile: text(v.profile, "Profil", 120), location: text(v.location, "Lieu / modalit\xE9", 120), unit: choice(v.unit, Object.keys(UNITS), "Unit\xE9"), amountMinor: amount(v.amountMinor, "Tarif"), startDate: date(v.startDate, "D\xE9but du tarif"), endDate: date(v.endDate, "Fin du tarif"), notes: text(v.notes, "Note tarif", 1500) };
    if (r.startDate && r.endDate && r.endDate < r.startDate) throw new Error("La fin du tarif pr\xE9c\xE8de son d\xE9but.");
    if (r.status === "validated" && r.amountMinor === null) throw new Error("Un tarif valid\xE9 doit avoir un montant.");
    return r;
  });
  for (let i = 0; i < m.prices.length; i++) for (let j = i + 1; j < m.prices.length; j++) {
    const a = m.prices[i], b = m.prices[j];
    if (a.status === "validated" && b.status === "validated" && ["label", "profile", "location", "unit"].every((k) => key(a[k]) === key(b[k])) && overlaps(a, b)) throw new Error("Deux tarifs valid\xE9s sont applicables \xE0 la m\xEAme prestation, au m\xEAme profil et au m\xEAme lieu.");
  }
  m.ceilings = input.ceilings.map((v) => {
    const r = { ...common(v, ids), label: text(v.label, "Plafond", 180, true), scope: choice(v.scope, ["annual", "contract", "period"], "P\xE9rim\xE8tre"), periodId: text(v.periodId, "P\xE9riode du plafond", 80), amountMinor: amount(v.amountMinor, "Plafond"), basis: choice(v.basis, ["HT", "TTC"], "Base du plafond"), consumptionBasis: choice(v.consumptionBasis, ["orders", "invoices"], "Base de consommation"), notes: text(v.notes, "Note plafond", 1500) };
    if (r.scope === "period" && !m.periods.some((p) => p.id === r.periodId)) throw new Error("Rattachez le plafond \xE0 une p\xE9riode existante.");
    if (r.scope !== "period") r.periodId = "";
    if (r.status === "validated" && r.amountMinor === null) throw new Error("Un plafond valid\xE9 doit avoir un montant.");
    return r;
  });
  m.issues = input.issues.map((v) => {
    const s = source(v.source);
    if (s.documentId && !ids.has(s.documentId)) throw new Error("Pi\xE8ce de contradiction \xE9trang\xE8re au march\xE9.");
    const r = { id: text(v.id, "Identifiant", 80, true), title: text(v.title, "Point \xE0 confirmer", 240, true), detail: text(v.detail, "D\xE9tail", 2500), blocking: v.blocking === true, status: choice(v.status, ["open", "resolved"], "R\xE9solution"), resolution: text(v.resolution, "D\xE9cision", 2e3), source: s };
    if (r.status === "resolved" && !r.resolution) throw new Error("Expliquez la r\xE9solution du point \xE0 confirmer.");
    return r;
  });
  if (m.status === "validated") {
    const blockers = activationBlockers(m);
    if (blockers.length) throw new Error("Param\xE9trage non validable : " + blockers.join(" ; "));
  }
  return m;
}
function activationBlockers(m) {
  const b = [];
  if (!m.reference) b.push("r\xE9f\xE9rence manquante");
  if (!m.prices.some((r) => r.status === "validated")) b.push("aucun tarif valid\xE9");
  else if (m.prices.some((r) => r.status !== "validated")) b.push("tarifs encore \xE0 v\xE9rifier");
  if (!m.periods.some((r) => r.status === "validated")) b.push("aucune p\xE9riode valid\xE9e");
  if (m.periodBasis === "unknown") b.push("r\xE8gle de p\xE9riode \xE0 pr\xE9ciser");
  if (m.renewalMode === "unknown") b.push("reconduction \xE0 pr\xE9ciser");
  if (m.type === "framework" && !m.ceilings.some((r) => r.status === "validated")) b.push("plafond \xE0 valider");
  else if (m.ceilings.some((r) => r.status !== "validated")) b.push("plafonds encore \xE0 v\xE9rifier");
  if (m.issues.some((r) => r.blocking && r.status === "open")) b.push("point contractuel bloquant non r\xE9solu");
  return b;
}
function suggestFromText(text2) {
  const suggestions = [];
  const lines = String(text2).split(/\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const cap = line.match(/(?:maximum|plafond|montant maximal).*?(\d[\d \u00a0]*[,.]?\d{0,2})\s*(?:€|euros)/i);
    if (cap) {
      try {
        suggestions.push({ kind: "ceiling", value: minor(cap[1]), basis: /\bHT\b|hors taxes/i.test(line) ? "HT" : /\bTTC\b/i.test(line) ? "TTC" : null, annual: /annuel|par an|année/i.test(line), excerpt: line.slice(0, 500) });
      } catch {
      }
    }
  }
  return suggestions.slice(0, 20);
}

// marches/worker.mjs
var MAX_FILE = 5 * 1024 * 1024;
var MAX_MARKET = 50 * 1024 * 1024;
var documentColumns = "id,market_id,name,kind,mime,size,sha256,uploaded_at,uploaded_by,length(extracted_text) AS text_length";
var unpack2 = (r) => ({ ...JSON.parse(r.payload), id: r.id, version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by });
var doc = (r) => ({ id: r.id, name: r.name, kind: r.kind, mime: r.mime, size: r.size, sha256: r.sha256, uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by, hasText: r.text_length > 0 });
var validId = (s) => /^[a-zA-Z0-9_-]{1,80}$/.test(s);
async function bytes(request, max) {
  let n = 0;
  const parts = [];
  for await (const part of request.body || []) {
    n += part.length;
    if (n > max) throw Object.assign(new Error("Pi\xE8ce trop volumineuse : maximum 5 Mo par fichier."), { status: 413 });
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}
function fileType(name, b) {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf" && b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (["docx", "xlsx"].includes(ext) && b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4) return ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "png" && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (["jpg", "jpeg"].includes(ext) && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["txt", "csv"].includes(ext) && !b.includes(0)) return "text/plain";
  throw Object.assign(new Error("Format non reconnu. Utilisez PDF, DOCX, XLSX, PNG, JPG, TXT ou CSV."), { status: 415 });
}
async function handleMarkets(request, db, email, admin, reply, jsonBody2) {
  if (!admin) return reply(403, { error: "Le param\xE9trage des march\xE9s est r\xE9serv\xE9 \xE0 la direction habilit\xE9e." });
  const parts = new URL(request.url).pathname.split("/").filter(Boolean).slice(2);
  const [id, section, documentId] = parts;
  if (parts.length > 3 || id && !validId(id) || documentId && !validId(documentId)) return reply(404, { error: "Ressource introuvable." });
  const getDocs = async (marketId) => (await db.prepare("SELECT " + documentColumns + " FROM market_documents WHERE market_id=? ORDER BY uploaded_at,id").bind(marketId).all()).results;
  if (!id) {
    if (request.method === "GET") {
      const result = await db.prepare("SELECT * FROM markets ORDER BY updated_at DESC LIMIT 500").all();
      const workspace = await db.prepare("SELECT payload FROM budgets_workspace WHERE id='shared'").first();
      const clients = workspace ? (JSON.parse(workspace.payload).clients || []).map((c) => ({ id: c.id, name: c.name })) : [];
      return reply(200, { markets: result.results.map(unpack2), clients });
    }
    if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
    const data = await jsonBody2(request, 256e3);
    if (!validId(data?.id)) return reply(400, { error: "Identifiant de cr\xE9ation requis." });
    let market;
    try {
      market = validateMarket(data.market, []);
    } catch (e) {
      return reply(400, { error: e.message });
    }
    if (market.status !== "draft") return reply(400, { error: "Cr\xE9ez d\u2019abord le march\xE9 en pr\xE9paration, puis ajoutez ses pi\xE8ces." });
    const current2 = await db.prepare("SELECT * FROM markets WHERE id=?").bind(data.id).first();
    if (current2) return JSON.stringify(JSON.parse(current2.payload)) === JSON.stringify(market) ? reply(200, { market: unpack2(current2), documents: (await getDocs(data.id)).map(doc) }) : reply(409, { error: "Cette cr\xE9ation a d\xE9j\xE0 \xE9t\xE9 enregistr\xE9e. Actualisez la liste." });
    const stamp2 = (/* @__PURE__ */ new Date()).toISOString();
    const row = await db.prepare("INSERT INTO markets(id,payload,version,updated_at,updated_by) VALUES(?,?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING *").bind(data.id, JSON.stringify(market), stamp2, email).first();
    if (!row) return reply(409, { error: "Ce march\xE9 a d\xE9j\xE0 \xE9t\xE9 cr\xE9\xE9. Actualisez la liste." });
    return reply(201, { market: unpack2(row), documents: [] });
  }
  const current = await db.prepare("SELECT * FROM markets WHERE id=?").bind(id).first();
  if (!current) return reply(404, { error: "March\xE9 introuvable." });
  if (!section) {
    if (request.method === "GET") return reply(200, { market: unpack2(current), documents: (await getDocs(id)).map(doc) });
    if (request.method !== "PUT") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
    const raw = request.headers.get("if-match");
    if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return reply(428, { error: "Version de la fiche requise." });
    const input = await jsonBody2(request, 256e3);
    let market;
    try {
      market = validateMarket(input, await getDocs(id));
    } catch (e) {
      return reply(400, { error: e.message });
    }
    const row = await db.prepare("UPDATE markets SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=? RETURNING *").bind(JSON.stringify(market), (/* @__PURE__ */ new Date()).toISOString(), email, id, Number(raw)).first();
    if (!row) return reply(409, { error: "Un coll\xE8gue a modifi\xE9 ce march\xE9. Votre saisie est conserv\xE9e : exportez-la avant de recharger la fiche." });
    return reply(200, { market: unpack2(row), documents: (await getDocs(id)).map(doc) });
  }
  if (section === "history" && !documentId && request.method === "GET") {
    const rows = await db.prepare("SELECT version,payload,updated_at,updated_by FROM market_versions WHERE market_id=? ORDER BY version DESC LIMIT 100").bind(id).all();
    return reply(200, { versions: rows.results.map((r) => ({ version: r.version, market: JSON.parse(r.payload), updatedAt: r.updated_at, updatedBy: r.updated_by })) });
  }
  if (section !== "documents") return reply(404, { error: "Ressource introuvable." });
  if (documentId) {
    if (request.method !== "GET") return reply(405, { error: "Les pi\xE8ces sources sont conserv\xE9es sans remplacement." });
    const row = await db.prepare("SELECT " + documentColumns + " FROM market_documents WHERE id=? AND market_id=?").bind(documentId, id).first();
    if (!row) return reply(404, { error: "Pi\xE8ce introuvable dans ce march\xE9." });
    if (new URL(request.url).searchParams.has("analysis")) {
      const extracted2 = await db.prepare("SELECT extracted_text FROM market_documents WHERE id=? AND market_id=?").bind(documentId, id).first();
      return reply(200, { text: extracted2.extracted_text, suggestions: suggestFromText(extracted2.extracted_text) });
    }
    const chunks = (await db.prepare("SELECT data FROM market_document_chunks WHERE document_id=? ORDER BY sequence").bind(documentId).all()).results;
    const body2 = Buffer.concat(chunks.map((c) => Buffer.from(c.data, "base64")));
    if (body2.length !== row.size || createHash("sha256").update(body2).digest("hex") !== row.sha256) return reply(503, { error: "Contr\xF4le d\u2019int\xE9grit\xE9 de la pi\xE8ce non satisfait. Contactez le responsable." });
    const headers = new Headers(reply(200, {}).headers);
    headers.set("Content-Type", row.mime);
    headers.set("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(row.name));
    headers.set("Content-Security-Policy", "sandbox");
    return new Response(body2, { headers });
  }
  if (request.method === "GET") return reply(200, { documents: (await getDocs(id)).map(doc) });
  if (request.method !== "POST") return reply(405, { error: "M\xE9thode non autoris\xE9e." });
  if (JSON.parse(current.payload).status === "archived") return reply(409, { error: "Le march\xE9 archiv\xE9 ne peut plus recevoir de nouvelles pi\xE8ces." });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return reply(415, { error: "Fichier multipart requis." });
  const body = await bytes(request, MAX_FILE + 7e5);
  let form;
  try {
    form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") } }).formData();
  } catch {
    return reply(400, { error: "Envoi de fichier invalide." });
  }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function" || file.size < 1 || file.size > MAX_FILE) return reply(400, { error: "Choisissez une pi\xE8ce non vide de 5 Mo maximum." });
  const content = Buffer.from(await file.arrayBuffer());
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 220) || "piece";
  const mime = fileType(name, content);
  const kind = String(form.get("kind") || "other");
  if (!["ae", "price", "clauses", "notification", "amendment", "renewal", "offer", "other"].includes(kind)) return reply(400, { error: "Nature de pi\xE8ce invalide." });
  const extracted = String(form.get("text") || "").slice(0, 15e4);
  const hash = createHash("sha256").update(content).digest("hex");
  const existing = await db.prepare("SELECT " + documentColumns + " FROM market_documents WHERE market_id=? AND sha256=?").bind(id, hash).first();
  if (existing) return reply(200, { document: doc(existing), duplicate: true });
  const total = await db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS bytes FROM market_documents WHERE market_id=?").bind(id).first();
  if (total.count >= 50 || total.bytes + content.length > MAX_MARKET) return reply(413, { error: "Limite atteinte : 50 pi\xE8ces ou 50 Mo par march\xE9." });
  const did = crypto.randomUUID(), stamp = (/* @__PURE__ */ new Date()).toISOString();
  const statements = [db.prepare("INSERT INTO market_documents(id,market_id,name,kind,mime,size,sha256,uploaded_at,uploaded_by,extracted_text) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(did, id, name, kind, mime, content.length, hash, stamp, email, extracted)];
  for (let offset = 0, seq = 0; offset < content.length; offset += 131072, seq++) statements.push(db.prepare("INSERT INTO market_document_chunks(document_id,sequence,data) VALUES(?,?,?)").bind(did, seq, content.subarray(offset, offset + 131072).toString("base64")));
  try {
    await db.batch(statements);
  } catch (error) {
    if (error.message?.includes("market_document_quota")) return reply(413, { error: "Limite atteinte : 50 pi\xE8ces ou 50 Mo par march\xE9." });
    if (error.message?.includes("market_archived")) return reply(409, { error: "Le march\xE9 vient d\u2019\xEAtre archiv\xE9. La pi\xE8ce n\u2019a pas \xE9t\xE9 ajout\xE9e." });
    const duplicate = await db.prepare("SELECT " + documentColumns + " FROM market_documents WHERE market_id=? AND sha256=?").bind(id, hash).first();
    if (duplicate) return reply(200, { document: doc(duplicate), duplicate: true });
    throw error;
  }
  return reply(201, { document: { id: did, name, kind, mime, size: content.length, sha256: hash, uploadedAt: stamp, uploadedBy: email, hasText: !!extracted }, suggestions: suggestFromText(extracted) });
}

// server/budget-service-source.mjs
var admins = ["quilici.pascal@cdinnov.com", "pasqualini.david@cdinnov.com", "boulanger.albert@cdinnov.com"];
var portalAccounts = [...admins, "calendini.matthieu@cdinnov.com", "vincenti.paulmichel@cdinnov.com"];
var normalize = (value) => String(value || "").trim().toLowerCase();
var empty = { demo: false, clients: [], projects: [], budgetLines: [], expenses: [], drs: [], imports: [] };
var clientKey = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
function addClientNames(clients, names) {
  const result = structuredClone(clients);
  for (const value of names) {
    const name = canonicalClientName(value);
    if (!validClientName(name)) continue;
    if (!result.some((client) => [client.name, ...client.aliases || []].some((alias) => sameClientName(alias, name)))) result.push({ id: crypto.randomUUID(), name, accounts: [], ...value !== name ? { aliases: [value] } : {} });
  }
  return result;
}
var schema = [
  agendaSchema,
  agendaNotifySchema,
  "CREATE TABLE IF NOT EXISTS budgets_workspace (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS budgets_login_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS budgets_login_challenges (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)"
];
var equal = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer2.from(a), Buffer2.from(b));
var fingerprint = (acc) => createHash2("sha256").update(JSON.stringify([acc.salt, acc.iter, acc.hash])).digest("hex");
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
    const data = JSON.parse(Buffer2.from(body, "base64url").toString());
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
    chunks.push(Buffer2.from(chunk));
  }
  try {
    return JSON.parse(Buffer2.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Donn\xE9es JSON invalides."), { status: 400 });
  }
}
function validateWorkspace(ws) {
  if (!ws || typeof ws !== "object" || Array.isArray(ws) || typeof ws.demo !== "boolean") return false;
  for (const key2 of ["clients", "projects", "budgetLines", "expenses", "drs", "imports"]) {
    if (!Array.isArray(ws[key2]) || ws[key2].length > 1e4 || ws[key2].some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) return false;
    if (new Set(ws[key2].map((item) => item.id)).size !== ws[key2].length) return false;
  }
  return true;
}
var budget_service_source_default = {
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
        const limitKeys = ["email:" + email2, "ip:" + (request.headers.get("cf-connecting-ip") || "unknown")].map((v) => createHash2("sha256").update(v).digest("hex"));
        if (input.action === "challenge") for (const key2 of limitKeys) {
          const limit = await db.prepare("INSERT INTO budgets_login_limits (id,attempts,until_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until_at<? THEN 1 ELSE attempts+1 END, until_at=CASE WHEN until_at<? THEN excluded.until_at ELSE until_at END RETURNING attempts").bind(key2, now + 9e5, now, now).first();
          if (limit.attempts > 20) return reply(429, { error: "Trop de tentatives. R\xE9essayez dans 15 minutes." });
        }
        const acc = await account(env, email2);
        if (input.action === "challenge") {
          const body2 = Buffer2.from(JSON.stringify({ aud: "cdinnov-budget-login", email: email2, exp: now + 6e4, fingerprint: acc ? fingerprint(acc) : randomBytes(32).toString("hex"), nonce: randomBytes(24).toString("hex") })).toString("base64url");
          return reply(200, { challenge: body2 + "." + sign(body2, env.BUDGETS_SESSION_SECRET), salt: acc?.salt || randomBytes(16).toString("hex"), iter: acc?.iter || 15e4 });
        }
        const denied = () => reply(401, { error: "Connexion CDInnov invalide ou expir\xE9e. Reconnectez-vous." });
        if (typeof input.challenge !== "string" || input.challenge.length > 2e3 || typeof input.proof !== "string" || !/^[a-f0-9]{64}$/.test(input.proof)) return denied();
        const [challengeBody, challengeSignature, extra] = input.challenge.split(".");
        if (extra || !challengeBody || !equal(sign(challengeBody, env.BUDGETS_SESSION_SECRET), challengeSignature)) return denied();
        let challenge;
        try {
          challenge = JSON.parse(Buffer2.from(challengeBody, "base64url").toString());
        } catch {
          return denied();
        }
        if (challenge.aud !== "cdinnov-budget-login" || challenge.email !== email2 || challenge.exp < now || !acc || !equal(challenge.fingerprint, fingerprint(acc))) return denied();
        const consumed = await db.prepare("INSERT INTO budgets_login_challenges (nonce,expires_at) VALUES (?,?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce").bind(challenge.nonce, challenge.exp).first();
        if (!consumed) return denied();
        await db.prepare("DELETE FROM budgets_login_challenges WHERE expires_at<?").bind(now).run();
        const actual = createHmac("sha256", Buffer2.from(acc.hash, "hex")).update(input.challenge).digest("hex");
        if (!equal(actual, input.proof)) return denied();
        const expiresAt = now + 8 * 60 * 60 * 1e3;
        const body = Buffer2.from(JSON.stringify({ aud: "cdinnov-budgets", email: email2, exp: expiresAt, fingerprint: fingerprint(acc), nonce: randomBytes(16).toString("hex") })).toString("base64url");
        await db.prepare("DELETE FROM budgets_login_limits WHERE id=? OR until_at<?").bind(limitKeys[0], now).run();
        return reply(200, { token: body + "." + sign(body, env.BUDGETS_SESSION_SECRET), expiresAt });
      }
      const email = await identity(request, env);
      if (!email) return reply(401, { error: "Votre connexion CDInnov a expir\xE9. Reconnectez-vous \xE0 votre compte CDInnov." });
      if (path === "/budgets/markets" || path.startsWith("/budgets/markets/")) return await handleMarkets(request, db, email, admins.includes(email), reply, jsonBody);
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
          if (Buffer2.byteLength(payload2) > 15e5) return reply(413, { error: "Le r\xE9pertoire d\xE9passe la capacit\xE9 de cet espace. R\xE9duisez la taille des logos." });
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
export {
  addClientNames,
  clientKey,
  budget_service_source_default as default,
  schema,
  validateWorkspace
};
