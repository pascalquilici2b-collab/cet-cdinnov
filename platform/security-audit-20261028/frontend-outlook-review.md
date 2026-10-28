# Audit frontend et Outlook — 28 octobre 2026

Périmètre source : révision de départ `531ea21`, `index.html`, `platform/client`, `apps/sheets/src`, `apps/budgets/app`, `apps/budgets/lib`, modules de composition/envoi Microsoft. Les budgets n'ont pas de dossier `src` : `app` et `lib` ont été examinés à sa place.

Travail exclusivement local : données, identités et jetons fictifs ; aucun message Microsoft envoyé ; aucun consentement ni compte Microsoft réel manipulé. Le navigateur de preuve bloque toutes les requêtes réseau. Aucun build global, commit ou déploiement effectué par ce sous-audit. Les documents AGIRIS déjà modifiés et le chunk non suivi préexistant ont été préservés.

## Constat F1 — P1 / élevé — XSS enregistrée via l'adresse d'un justificatif

**Chemin actif :** un justificatif de note de frais est lu par `nfJustifPreview` dans `index.html` ; `privateFileURL` renvoyait toute chaîne non reconnue comme fichier du serveur, sans vérifier son schéma. La chaîne devenait le `href` du lien « Télécharger ». L'échappement HTML de l'attribut ne neutralise pas le schéma `javascript:`. L'attribut `download` ne l'empêchait pas non plus dans Chromium.

**Preuve locale reproductible :** avec `justificatif: 'javascript:window.__auditExecuted=1;void(0)'`, un clic réel dans Chromium sur le lien construit par la fonction originale donne `executed: true`. La preuve emploie les fonctions extraites de la révision originale, sans réécrire leur implémentation, dans une page isolée. Elle vérifie le chemin de rendu réel, mais ne simule pas toute la navigation métier de l'application. L'agent de contrôle d'accès a séparément confirmé et corrigé les écritures adversariales par collaborateur dans le Worker local.

**Impact :** un collaborateur pouvant modifier sa note pouvait viser la personne ouvrant son justificatif, notamment un responsable. Le script s'exécute avec les pouvoirs de la page victime. Les jetons applicatifs accessibles au JavaScript et les données consultables par cette session aggravent l'impact ; aucune tentative de lecture ou d'exfiltration réelle n'a été effectuée.

**Correction :** `safePrivateFileURL` est appelée par `privateFileURL` et `privateFileFetch`, dans `platform/client/portal-compat.js` et sa copie dans `index.html`. Sont acceptés les fichiers `/files/` de l'origine de service configurée, sans identifiants dans l'URL, et les anciennes données base64 PDF/PNG/JPEG/WebP/GIF. Sont rejetés `javascript:`, HTML/SVG en `data:`, les autres origines, les URL contenant des identifiants et les chemins étrangers à `/files/`. Cette défense protège aussi les anciennes données déjà enregistrées, indépendamment de la nouvelle validation serveur.

Après correction : même clic de preuve impossible car le lien est refusé ; `executed: false`, `rejected: true`.

## Constat F2 — P2 / moyen — paramètres JavaScript incorporés aux anciens boutons

**Code :** `halfCell`, `congeHalfChip`, menus de congés, `salPickerHTML`, `nfStatutPickerHTML`, `facturxRowActions`, `openFacturX` et plusieurs boutons associés dans `index.html`.

Des identifiants, matricules, dates ou statuts étaient interpolés dans des chaînes JavaScript d'attributs `onclick`. Même `esc(f.id)` était insuffisant : le navigateur redécode l'entité HTML de l'apostrophe avant de compiler le gestionnaire JavaScript. Une valeur fictive `');window.__handlerExecuted=1;//` exécutait le marqueur dans les trois fonctions de preuve `halfCell`, `nfStatutPickerHTML`, `facturxRowActions`.

**Limite d'exploitabilité :** les deux derniers générateurs de preuve ne sont plus appelés par les vues React actuelles ; leur démonstration ne constitue pas à elle seule un parcours attaquable dans l'interface actuelle. Des menus de congés et `openFacturX` restent connectés aux contrôleurs classiques. Le matricule salarié est modifiable par un administrateur ; l'agent de contrôle d'accès a en revanche reproduit des statuts, identifiants de note et dates de congé arbitraires enregistrables par un collaborateur. La gravité dépend donc du champ et du parcours précis ; ce constat n'est pas présenté comme une seconde prise de contrôle générale indépendante de F1.

**Correction :** `inlineArg` combine sérialisation de chaîne JavaScript avec échappement HTML ; 55 interpolations simples des gestionnaires ont été remplacées, ainsi que le bouton construit par concaténation dans `openFacturX`. Le `value` du sélecteur matricule est échappé. `dateFR` ne réinjecte plus une chaîne arbitraire en cas de date non ISO. Les trois reproductions ne déclenchent plus de marqueur.

## Constat F3 — P2 / moyen — injection de formules CSV

Le CSV classique (`csvCell`, exports congés/CET/facturier/codes affaires) et le CSV budgets entouraient les valeurs de guillemets mais ne neutralisaient pas les débuts de formules. Sheets protégeait uniquement les cellules commençant immédiatement par `=`, `+`, `-` ou `@`, en oubliant les en-têtes et les préfixes de contrôle/espacement.

**Preuve :** avant correction `csvCell('=1+1')` produit `"=1+1"`, conservant la formule active dans le CSV. Des cellules ou titres de colonnes adversariaux pouvaient ainsi être interprétés par un tableur à l'ouverture. L'exécution d'une formule externe dépend du tableur et de ses réglages ; aucun lancement de commande ou accès externe via Excel n'a été tenté.

**Correction :** utilitaire partagé `platform/csv-export.ts`, employé par Sheets et budgets, plus fonction équivalente dans le portail classique. Le texte sérialisé à risque reçoit une apostrophe avant son échappement CSV, y compris espaces, BOM, contrôles, tabulations et sauts de ligne en tête ; seuls les vrais nombres sont exemptés. La revue croisée a trouvé puis fait corriger le cas d'une valeur JSON tableau (`['=1+1']`) transformée en chaîne par l'export. Les en-têtes suivent exactement la même règle. Aucune cellule stockée n'est modifiée.

Les exports XLSX inspectés distinguent les chaînes des formules explicites. Un aller-retour XLSX réel confirme que des noms de projet/client commençant par `=` restent des cellules de type chaîne, sans champ formule. Les formules de totalisation générées par l'application utilisent des adresses de cellules et des nombres calculés, pas les libellés utilisateur.

## Constat F4 — P3 / défense en profondeur — frontière des chemins Graph

`graph()` vérifiait seulement `path.startsWith('/me')`, acceptant par exemple `/messages` ou `/me/../users/other/messages`. **Aucun appel exposant ce paramètre directement à un utilisateur n'a été identifié** : les appelants actuels construisent leurs routes et encodent les identifiants de messages. Il ne s'agit pas d'une preuve d'accès à une autre boîte.

La vérification exige maintenant `/me` suivi de `/`, `?` ou de la fin, puis contrôle encore le chemin après normalisation URL. Les routes trompeuses ou traversantes sont rejetées avant toute requête. Les tests de brouillons et d'envoi existants restent verts.

## Autres contrôles et résultats

| Zone | Résultat et limites |
| --- | --- |
| React / HTML | Aucun `eval` ou `new Function` identifié dans les sources Sheets, budgets ou `platform/client`. L'usage de `dangerouslySetInnerHTML` identifié dans `Icon` ne reçoit que le catalogue statique d'icônes. Texte, contacts et noms sont rendus par React ou échappés dans les vues examinées. |
| Formules Sheets / imports CSV | L'interpréteur est un parseur arithmétique avec liste de fonctions autorisées. Les tests rejettent JavaScript, `WEBSERVICE`, `HYPERLINK` et l'accès à `constructor`. L'import de texte HTML le conserve comme texte ; aucune exécution à l'import n'a été observée. |
| Prévisualisation justificatifs | Les fichiers non images utilisent un `iframe sandbox` sans autorisation de scripts. Les fichiers privés chargés sont convertis en URL Blob ; F1 portait sur les références renvoyées directement avant cette étape. |
| Liens juridiques clients | `normalizeClientDetails` limite la source au chemin établissement attendu sur le domaine de l'annuaire officiel, avec SIRET numérique. |
| Ponts `postMessage` | Budgets et Factur-X contrôlent à la fois l'origine et la fenêtre émettrice. Factur-X ajoute l'identifiant de session d'intégration. Les réponses sont limitées à l'origine attendue. Aucun `targetOrigin: '*'` identifié dans ces ponts. |
| OAuth Microsoft | Client SPA MSAL, autorité et tenant fixes, callback dédié ; identifiants publics uniquement, pas de secret client. Le paquet installé délègue PKCE et validation de réponse/state à MSAL. La connexion réelle et les réglages Entra n'ont pas été testés. |
| Isolation Microsoft | Sélection unique par tenant et identifiant de connexion ; `/me` vérifié contre l'adresse de session ; session applicative relue avant mutation et avant envoi. Tests existants : mauvaise identité et changement de session refusés. |
| Scopes | `User.Read` et `Mail.ReadWrite` pour les brouillons ; `Mail.Send` demandé par action explicite d'activation. Aucun scope applicatif de boîte partagée dans la configuration revue. |
| Jetons / stockage | MSAL utilise `sessionStorage`, sans journalisation PII. Les journaux locaux d'envoi contiennent des identifiants/états et empreintes, pas les corps et PJ. Le jeton de session CDInnov reste dans `localStorage` pour le portail/Sheets : exposition résiduelle à toute future XSS du même domaine. Ce sous-audit ne migre pas l'architecture d'authentification. |
| Signature | Texte échappé ; images limitées à PNG/JPEG, vérification des octets initiaux ; HTML/SVG et images mal étiquetées rejetés. La signature produite utilise `cid:` pour l'image jointe. |
| Pièces jointes / MIME | Limites quantité/taille, noms normalisés, refus CR/LF, Content-ID contraint, PDF vérifié par signature initiale ; essais locaux de bourrage d'en-tête rejetés. Il ne s'agit pas d'un antivirus du contenu joint. |
| Destinataires et envoi | CR/LF et syntaxe d'en-tête refusés, doublons retirés, plafond de 50 destinataires. Avant envoi : relecture du sujet/corps, des listes À/Cc/Cci et des octets des PJ ; confirmation explicite ; garde des doublons et des réponses incertaines. Ces comportements passent avec un Graph fictif. |
| URLs Outlook | HTTPS, hôtes Outlook autorisés, aucun identifiant URL ; tests négatifs `javascript:`, `data:`, hôte suffixé et confusion `@` réussis. |

L'équivalence de corps HTML tolère la réécriture de mise en forme d'Exchange ; elle compare texte, images et liens plutôt qu'une identité octet pour octet du HTML. Ce n'est pas une garantie d'identité visuelle de tout CSS arbitraire. Aucun HTML libre de signature n'est offert par l'interface revue.

## Commandes et résultats

Depuis la racine du dépôt :

```powershell
node platform/security-audit-20261028/frontend-proof.mjs --baseline
node platform/security-audit-20261028/frontend-proof.mjs --fixed
node --test platform/security-audit-20261028/frontend-security-test.mjs platform/billing-microsoft-draft-test.mjs platform/billing-microsoft-send-test.mjs platform/billing-microsoft-send-testmail-test.mjs
node --test apps/sheets/test/domain-parity.test.mjs
node node_modules/typescript/bin/tsc -p apps/sheets/tsconfig.core.json --noEmit
node node_modules/typescript/bin/tsc -p apps/budgets/tsconfig.json --noEmit
git diff --check
```

- Baseline `531ea21` : marqueur XSS URL et trois marqueurs des anciens gestionnaires = `true` ; CSV conserve `=1+1`.
- Correctifs : URL refusée, tous les marqueurs = `false`, CSV contient l'apostrophe de protection.
- Sécurité frontend + Graph : **20/20 tests passent**.
- Parité Sheets : **3/3 tests passent, 284 cas différentiels**.
- Vérifications TypeScript Sheets core / budgets et diff : réussies.

Un test d'interface existant lancé en complément, `platform/billing-contacts-outlook-test.mjs`, échouait sur son sélecteur historique `.bill-message-success`, alors que son instantané accessible contenait bien l'état « Fiche enregistrée ». Ce sélecteur a été remplacé par le rôle accessible `status` et le texte exact. La relance franchit l'enregistrement des contacts, leur persistance et rechargement, ainsi que la sélection des périodes ; elle échoue ensuite à la ligne 41 sur l'ancien bouton « Modifier l’objet du document », absent de l'interface actuelle. D'autres attentes de ce test historique se rapportent également à l'ancien composeur ; aucune assertion métier n'a été supprimée pour masquer un échec. La suite entière reste à moderniser et n'est pas présentée comme verte. Les tests unitaires Outlook actuels passent.

## Revue indépendante des correctifs d'accès

Relecture de `identity.ts`, `portal.ts`, `security-access-test.mjs` et `security-access-regressions.mjs` demandée après le premier volet.

- Le HMAC de liaison des challenges publics élimine l'oracle de comparaison hors ligne précédemment publié. Il inclut le compte et l'empreinte de mot de passe, avec séparation de domaine. Le faux sel est stable par adresse et différent entre adresses ; chaque challenge conserve un nonce aléatoire.
- Tests supplémentaires : challenge ancien avec empreinte publique refusé, preuve valide utilisable une seule fois, ancienne session signée selon le contrat précédent encore acceptée. Les jetons de session et leurs règles de révocation ne sont pas modifiés par cette correction.
- Régression trouvée par cette revue : la validation initiale contrôlait également tous les anciens champs inchangés. Une note d'un autre employé contenant une vieille date non ISO ou un statut historique bloquait une modification autorisée du collaborateur. Reproduite (`400` au lieu de `200`), signalée et corrigée par l'agent d'accès : seuls les champs nouveaux/modifiés sont validés par identité d'enregistrement. La lecture client sécurisée protège donc aussi les données anciennes conservées.
- Une collection `lignes` mal formée est maintenant refusée `400`, au lieu de déclencher une exception d'itération.

Commande indépendante : `node platform/security-audit-20261028/access-peer-test.mjs` — **deux groupes de vérifications passent** après correction. Verdict favorable sur ces changements ciblés. L'absence de toute différence temporelle ou d'énumération de comptes à paramètres de dérivation atypiques n'a pas été démontrée ; le correctif vérifié retire le signal évident du sel aléatoire renouvelé pour les seuls comptes absents.

## Livraison et suites

Fichiers de correction : `index.html`, `platform/client/portal-compat.js`, `platform/csv-export.ts`, `apps/sheets/src/workspace-domain.tsx`, `apps/budgets/app/page.tsx`, `platform/billing-microsoft-draft.ts`.

Fichiers de preuve : `frontend-proof.mjs`, `frontend-security-test.mjs`, ce rapport. Le test baseline lit la révision d'origine via `git show` et ne remet jamais le dépôt dans un état antérieur.

L'agent principal doit inclure ces sources dans son build/revue/deploiement global ; les bundles servis de Sheets, budgets et facturation n'ont pas été reconstruits par ce sous-audit. Les protections d'en-têtes/CSP, dépendances, backend et configuration de production sont traitées par les autres volets de l'audit. L'inspection du code et les tests fictifs ne certifient pas les permissions, consentements ou politiques conditionnelles du tenant Microsoft réel.
