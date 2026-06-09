/* ============================================================================
   CET · CDInnov — Worker Cloudflare (stockage des données dans Cloudflare KV)
   ============================================================================

   RÔLE
   Ce Worker expose deux opérations utilisées par l'application (index.html) :
     • GET  /<uuid>   → renvoie le JSON des données stockées sous la clé <uuid>
     • PUT  /<uuid>   → enregistre le corps JSON sous la clé <uuid>
   L'<uuid> est la valeur CLOUD_TOKEN renseignée dans index.html. Il joue le
   rôle de clé KV ET de "mot de passe" : sans connaître cet UUID, impossible de
   lire ou écrire les données.

   ----------------------------------------------------------------------------
   INSTALLATION (5 minutes, depuis le tableau de bord Cloudflare)
   ----------------------------------------------------------------------------
   1. Workers & Pages → Create application → Create Worker. Donnez-lui un nom
      (ex. "cet-cdinnov"). Déployez le worker vide une première fois.
   2. KV : Workers & Pages → KV → Create a namespace (ex. "CET_DATA").
   3. Liez le namespace au Worker :
      Worker → Settings → Variables and Secrets → KV Namespace Bindings →
      Add binding.  Variable name = CET_KV   |   KV namespace = CET_DATA
      (Le nom de variable DOIT être exactement CET_KV — voir le code ci-dessous.)
   4. Worker → Edit code → collez tout le contenu de ce fichier → Save and Deploy.
   5. Copiez l'URL du Worker (ex. https://cet-cdinnov.VOTRE-COMPTE.workers.dev)
      et collez-la dans index.html à la ligne :  const CLOUD_ENDPOINT = "...";
      (CLOUD_TOKEN est déjà pré-rempli avec votre UUID.)

   SÉCURITÉ
   • Le CORS est ouvert (*) pour simplifier. Pour restreindre à votre site
     GitHub Pages, remplacez "*" par "https://VOTRE-COMPTE.github.io".
   • Pour une couche d'authentification supplémentaire, décommentez le bloc
     AUTH ci-dessous et définissez un secret API_SECRET dans le Worker
     (Settings → Variables and Secrets → Add → Secret), puis ajoutez l'en-tête
     correspondant côté application.
   ========================================================================== */

const ALLOW_ORIGIN = "*"; // ex. "https://votre-compte.github.io" pour restreindre

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    // Pré-vol CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    // ---- AUTH optionnelle (décommenter pour activer) -----------------------
    // if (env.API_SECRET) {
    //   const auth = request.headers.get("Authorization") || "";
    //   if (auth !== "Bearer " + env.API_SECRET) {
    //     return new Response("Unauthorized", { status: 401, headers: cors() });
    //   }
    // }
    // ------------------------------------------------------------------------

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, "")); // tout après le "/"

    if (!key) {
      return new Response("Clé (UUID) manquante dans l'URL.", { status: 400, headers: cors() });
    }
    if (!env.CET_KV) {
      return new Response("Binding KV 'CET_KV' absent. Voir l'étape 3 de l'installation.", {
        status: 500, headers: cors(),
      });
    }

    // Lecture
    if (request.method === "GET") {
      const data = await env.CET_KV.get(key);
      return new Response(data ?? "", {
        headers: { ...cors(), "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Écriture
    if (request.method === "PUT" || request.method === "POST") {
      const body = await request.text();
      // garde-fou : on n'enregistre que du JSON valide
      try { JSON.parse(body); }
      catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), {
          status: 400, headers: { ...cors(), "Content-Type": "application/json" },
        });
      }
      await env.CET_KV.put(key, body);
      return new Response(JSON.stringify({ ok: true, bytes: body.length }), {
        headers: { ...cors(), "Content-Type": "application/json" },
      });
    }

    return new Response("Méthode non autorisée.", { status: 405, headers: cors() });
  },
};
