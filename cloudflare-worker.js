/* ============================================================================
   CET · CDInnov — Worker Cloudflare : stockage KV + notifications e-mail (Brevo)
   ============================================================================

   RÔLES
   - GET  /<uuid>   -> renvoie le JSON stocké sous la clé <uuid> (données de l'appli)
   - PUT  /<uuid>   -> enregistre le corps JSON sous la clé <uuid>
   - POST /notify   -> envoie un e-mail via Brevo (alertes congés / CET / note de frais)

   ----------------------------------------------------------------------------
   INSTALLATION DES NOTIFICATIONS (Brevo)
   ----------------------------------------------------------------------------
   1) Dans Brevo :
      - Settings -> SMTP & API -> API Keys -> "Generate a new API key" -> copiez-la.
      - Senders, Domains... -> Senders -> ajoutez et VÉRIFIEZ une adresse expéditrice
        (ex. notifications@cdinnov.com ou votre e-mail). C'est l'adresse "from".
   2) Dans Cloudflare (Worker "cet-data") -> Settings -> Variables and Secrets :
      - Secret  : BREVO_API_KEY      = votre clé API Brevo
      - Variable: NOTIFY_FROM        = l'adresse expéditrice vérifiée dans Brevo
      - Variable: NOTIFY_FROM_NAME   = "Gestion interne CDInnov"   (facultatif)
      - Variable: NOTIFY_TO          = destinataire(s), séparés par des virgules
                                       (ex. pascalquilici2b@gmail.com)
   3) Edit code -> collez ce fichier -> Save and Deploy.
   (Le binding KV "CET_KV" reste nécessaire pour le stockage des données.)
   ========================================================================== */

const ALLOW_ORIGIN = "*"; // remplacez par votre domaine GitHub Pages pour restreindre

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function sendBrevo(env, subject, html, toOverride) {
  const toRaw = (toOverride && String(toOverride).trim()) ? String(toOverride) : env.NOTIFY_TO;
  if (!env.BREVO_API_KEY || !env.NOTIFY_FROM || !toRaw) {
    return { ok: false, error: "Configuration e-mail manquante (BREVO_API_KEY / NOTIFY_FROM / destinataire)." };
  }
  const to = String(toRaw).split(",").map(e => ({ email: e.trim() })).filter(x => x.email);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify({
      sender: { email: env.NOTIFY_FROM, name: env.NOTIFY_FROM_NAME || "Gestion interne CDInnov" },
      to,
      subject: subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) { const t = await r.text(); return { ok: false, error: "Brevo " + r.status + ": " + t.slice(0, 300) }; }
  return { ok: true };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    // ---- Notification e-mail ----
    if (path === "notify") {
      if (request.method !== "POST") return new Response("Méthode non autorisée", { status: 405, headers: cors() });
      let body = {}; try { body = await request.json(); } catch (e) {}
      const subject = String(body.subject || "Notification — Gestion interne CDInnov").slice(0, 200);
      const html = body.html || ("<p>" + String(body.text || "Notification") + "</p>");
      const res = await sendBrevo(env, subject, html, body.to);
      return new Response(JSON.stringify(res), { status: res.ok ? 200 : 500, headers: { ...cors(), "Content-Type": "application/json" } });
    }

    // ---- Données KV ----
    const key = path;
    if (!key) return new Response("Clé (UUID) manquante dans l'URL.", { status: 400, headers: cors() });
    if (!env.CET_KV) return new Response("Binding KV 'CET_KV' absent.", { status: 500, headers: cors() });

    if (request.method === "GET") {
      const data = await env.CET_KV.get(key);
      return new Response(data ?? "", { headers: { ...cors(), "Content-Type": "application/json; charset=utf-8" } });
    }
    if (request.method === "PUT" || request.method === "POST") {
      const b = await request.text();
      try { JSON.parse(b); } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), { status: 400, headers: { ...cors(), "Content-Type": "application/json" } });
      }
      await env.CET_KV.put(key, b);
      return new Response(JSON.stringify({ ok: true, bytes: b.length }), { headers: { ...cors(), "Content-Type": "application/json" } });
    }
    return new Response("Méthode non autorisée.", { status: 405, headers: cors() });
  },
};
