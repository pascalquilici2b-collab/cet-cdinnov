# Sessions HttpOnly et convergence Factur-X — 5 novembre 2026

Revue et essais locaux sur des comptes, documents et bases temporaires fictifs. Aucun envoi de message ni écriture de donnée métier en production. Le présent relevé distingue les contrôles locaux de la publication du frontal et de l'image Linux.

## Changements vérifiés

- Le portail émet `__Host-cdi_session` avec `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sans `Domain`. Le corps de connexion contient seulement `email`, `expiresAt` et un `sessionId` public ; il ne contient plus de credential utilisable. La nouvelle audience invalide les anciennes sessions, y compris si leur valeur est placée dans un cookie. L'en-tête Bearer n'est jamais utilisé comme identité du portail.
- Le compte, ses droits et la liste des révocations sont relus à chaque requête. La déconnexion inscrit la révocation serveur puis efface le cookie ; une session déjà expirée ou absente peut également être déconnectée. Une connexion de remplacement révoque le cookie qu'elle remplace.
- Les mutations demandent l'origine autorisée et `X-CDInnov-Request: 1`. L'origine tierce, l'origine absente ou `null`, les requêtes identifiées `cross-site` et les marqueurs absents/incorrects échouent avant mutation. Les contrôles sont communs aux routes modernes et aux routes historiques.
- Les transports Facturier, Tamponnage et Budgets utilisent le cookie du même domaine. Un 401 émet un événement associé à l'identifiant public de la requête ; un 403 ne déclenche pas d'expiration. Le transport Budgets conserve les versions initiales lors d'une reconnexion du même compte afin de reprendre un brouillon avec contrôle des conflits, et les efface lors d'un changement de compte ou d'une déconnexion explicite.
- `/api/v1/facturx/*` contrôle la session et le droit Facturier avant tout appel. Seuls santé, schéma, recherche destinataire, lecture/aperçu de PDF et conversion sont permis. Les paramètres sont limités à la page d'aperçu et au format de sortie. L'émission de numéros/documents, le tamponnage, la connexion et les chemins arbitraires ne sont pas exposés par ce relais.
- Le relais réutilise les bindings privés `BILLING_PDF_SERVICE_URL` et `BILLING_PDF_SERVICE_KEY`. Il construit ses propres en-têtes, ne transmet ni cookie ni Bearer ni clé fournie par le navigateur, refuse les redirections et retire les en-têtes de connexion du moteur. Les corps sont limités à 16 Kio pour l'annuaire et 22 Mio pour le multipart PDF ; les réponses à 64 Mio. La conversion NDJSON reste diffusée progressivement.
- Le service Python ferme `/api/auth/login` avec 410 et refuse tous les anciens Bearer, même correctement signés et non expirés. Sa clé interserveur reste requise en ligne ; seule la santé demeure publique. La configuration historique `FACTURX_USERS_JSON` est devenue inutile. Les réponses d'erreur d'authentification reçoivent aussi les en-têtes de sécurité.

## Résultats locaux

| Vérification | Résultat |
| --- | --- |
| `node platform/identity-test.mjs` | 11 scénarios réussis : format/expiration, protocole challenge/preuve, usage unique concurrent, limitation, anciennes audiences, suppression/changement de compte. |
| `node platform/session-security-test.mjs` | 8 scénarios réussis : CSRF, révocation sur 11 routes, remplacement de compte, permissions immédiatement appliquées, relais documentaire borné, absence de propagation des secrets, diffusion NDJSON. |
| `node platform/test.mjs` | 15 scénarios réussis : budgets/projections/clients, sessions et caches, brouillon après reconnexion, conflits, Sheets, fichiers R2 et agenda. |
| `node marches/test.mjs` | 35 contrôles réussis dans le vrai Worker local : marchés, pièces contractuelles, versions/concurrence, quotas, isolation et révocation. |
| `node platform/identity-browser-test.mjs` | Réussi dans Edge avec les assets sources courants : véritable connexion PBKDF2/HMAC, cookie Secure/HttpOnly/Strict invisible au JavaScript et absent des deux stockages, absence de Bearer, refus CSRF, invitation/réinitialisation, droits admin/collaborateur, rechargement, fichiers privés, logout interonglets, révocation d'une copie de cookie et réponse de connexion tardive suivie d'une révocation. |
| Python : `test_server_auth_security.py`, `test_billing_issuance.py`, `test_stamping_api.py`, `test_document_security.py` | 44 tests réussis, 1 ignoré car réservé au runtime natif complet. Deux avertissements de dépréciation TestClient. Exécutés avec `platform/.private/facturx-venv`. |
| TypeScript plateforme et `git diff --check` ciblé | Réussis au moment de la revue. |

Les captures et le journal navigateur sans secrets sont conservés dans `platform/.private/security-audit-20261105/identity-browser/`. Le navigateur utilise une origine locale de confiance pour tester les attributs Secure ; le TLS et le domaine publics doivent être contrôlés sur le frontal publié.

## Revue indépendante de la construction native

Lecture du Dockerfile, de `build_ghostscript.py`, du verrou de sources/patches, de `verify_native_packages.py` et des tests de rendu. La construction séparée télécharge des sources dont les empreintes sont verrouillées, applique les deux patches présents, vérifie les sources corrigées et préserve les règles Debian. Elle produit quatre paquets locaux et une provenance contrôlant ensuite l'exécutable, la bibliothèque partagée et le profil ICC effectivement installés. La vérification des versions/provenances précède les essais documentaires sous UID 10001. Aucun repli silencieux sur le paquet Ghostscript de distribution n'est prévu. Aucun défaut bloquant n'a été trouvé dans cette chaîne lors de cette lecture ; seule la construction et l'exécution Linux effectives peuvent prouver son résultat.

## Limites de publication

Le frontal doit exposer les fichiers et API sur le même domaine que le portail avant activation des clients cookies. Les résultats ci-dessus ne prouvent ni le raccordement DNS, ni les en-têtes réellement servis en production, ni la reconstruction native Render. La révocation porte sur les requêtes suivantes ; un traitement documentaire déjà autorisé et démarré peut terminer.

## Revue indépendante du frontal

Les chemins `/api/v1/`, `/budgets/`, `/sheets/`, `/files/` et `/notify` sont transmis au service binding `CET_API` avec origine, cookie et marqueur CSRF. Les requêtes de fichiers statiques sont débarrassées des credentials. Les réponses HTML ajoutent une CSP HTTP et `frame-ancestors 'self'`, HSTS, nosniff, Referrer-Policy et Permissions-Policy ; les iframes internes restent autorisées. Les quatre tests de `frontend-security-test.mjs` réussissent.

La revue du manifeste initial a signalé trois corrections avant publication : inclure les modèles OCR `.traineddata.gz`, les polices PDF.js `.pfb` et leurs licences ciblées ; retirer le script de construction `agenda/install.mjs` et la source non bundlée `marches/reader.js` ; renouveler le dossier de sortie afin qu'un fichier retiré de la sélection ne reste pas dans un déploiement ultérieur. Ces corrections ont été vérifiées dans le livrable final décrit ci-dessous.

## Vérification du livrable compilé final

Contrôles exécutés sur `.build/frontend-anbdqg`, `.build/cdinnov-frontend.zip` et `.build/entry.mjs`, sans reconstruction pendant les tests et sans appel de production :

- `platform/frontend-artifact-test.mjs` compare exactement les **646 fichiers** du ZIP, du manifeste et du dossier neuf, puis compare chaque contenu. Aucun fichier résiduel, dossier privé, source serveur, rapport d'audit, source TypeScript/Python ou source map. Les deux sources inutiles et le chunk préexistant non concerné sont absents.
- **45 imports compilés actifs** sont résolus exclusivement depuis le ZIP : modules du portail, Feuilles, Budgets, lecteur documentaire et workers PDF. Les modèles OCR comprimés sont présents et décompressables ; les polices Type1 et fichiers WASM essentiels sont présents.
- Le navigateur Edge charge le `_worker.js` publié et sa CSP HTTP, démarre le vrai worker PDF.js, télécharge la police `FoxitSerif.pfb` (polices système désactivées), affiche un PDF fictif et extrait son texte. Il démarre ensuite le vrai Tesseract/WASM avec les deux modèles français/anglais publiés et reconnaît `DOCUMENT TEST 12345`. Toutes les requêtes locales réussissent ; aucun appel externe ni erreur JavaScript.
- `platform/identity-browser-test.mjs`, avec `FRONTEND_ARTIFACT` et `SESSION_WORKER_ARTIFACT`, réussit également sur ces bundles compilés : protocole réel de connexion, cookies invisibles, CSRF, droits, invitations/réinitialisation, fichiers privés, rechargement, déconnexion et révocation des réponses tardives. La CSP est celle du frontal compilé, pas seulement une balise HTML ni une réplique de sa logique.

Preuves : `platform/.private/security-audit-20261105/frontend-artifact/frontend-artifact-checks.json`, capture `artifact-pdf-render.png`, et `platform/.private/security-audit-20261105/identity-artifact/identity-browser-checks.json`.

## Incident de transition DNS et correction du message de connexion

Lecture seule après le signalement utilisateur : le frontal Cloudflare courant répond en JSON sur `/budgets/session`. En forçant uniquement la résolution vers l'ancienne adresse GitHub `185.199.108.153`, la page d'accueil contient déjà le nouveau client utilisant l'API du même domaine, tandis que GET `/budgets/session` retourne une page HTML 404. Cette coexistence pendant la conservation de l'ancien DNS explique la page HTML reçue par le navigateur ; aucun compte ou document de production n'a été modifié pour ce diagnostic.

La revue indépendante de `portalAuthJSON` confirme le refus des réponses HTML, des types inattendus et du JSON malformé sans exposer leur corps dans le message. Les erreurs JSON 401/403/429 restent conservées. Les cookies du même domaine, le marqueur CSRF, les vérifications de challenge et de session, et les protections contre les réponses tardives sont inchangés. Aucun nouvel essai automatique, chemin alternatif d'authentification ou stockage de secret. Les **15 tests** de `auth-response-test.mjs` ont été exécutés indépendamment avec succès.

La première reconstruction locale de ce correctif a révélé un défaut préexistant de génération : `String.replace` interprétait le `$&` présent dans la nouvelle expression régulière MIME et corrompait le JavaScript intégré. Le livrable `frontend-AuH2iC` a été refusé avant publication. Le build insère maintenant les deux bridges par callbacks, donc littéralement. Le test de livrable analyse désormais la syntaxe de tous les scripts JavaScript intégrés dans les HTML ; il reproduit bien le rejet de l'ancien livrable.

Le nouveau livrable **`.build/frontend-rGVL2D`** a réussi le parcours navigateur complet `identity-browser-test.mjs` avec le Worker API compilé. Le diff de l'index contient seulement les 29 lignes attendues du correctif de message ; aucune corruption des bridges. SHA-256 de cet index : `4ab6ca2e3413ab17291aff4555f64eb63533d6658297ec467ff7dd85cb9a1c54`. Preuve : `platform/.private/security-audit-20261105/login-response-artifact/identity-browser-checks.json`.

Avant publication, l'avancée indépendante RH de `origin/main` a été intégrée. Le livrable définitif **`.build/frontend-tjruVG`** a de nouveau réussi le parcours navigateur complet avec le Worker compilé fusionné et une base fictive. Les sources Worker/portail/RH sont identiques à `origin/main` ; le bridge RH est présent intégralement dans l'index. Les quatre imports du module RH compilé se résolvent dans ce livrable. Le diff d'index de 33 lignes correspond au correctif de 29 lignes, à un commentaire de chemin de compilation et aux fins de ligne du document Factur-X intégré (contenu décodé identique après normalisation CRLF). Aucun changement de logique RH ou Factur-X supplémentaire. Preuve : `platform/.private/security-audit-20261105/login-response-rh-artifact/identity-browser-checks.json`. Cette vérification n'a pas publié ni modifié le Worker de production.
