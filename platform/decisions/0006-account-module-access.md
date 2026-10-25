# Accès par compte aux rubriques — 25 octobre 2026

Les administrateurs configurent les accès dans **Paramètres & données → Comptes & accès → Accès**. Deux groupes : Pilotage (tableau de bord, mouvements CET, salariés, notes de frais, agenda) et Applications (tamponnage, facturation, budgets, CDInnovSheets). Les administrateurs ont tous les accès ; aucune restriction de module ne réduit leurs droits.

`platform/access.ts` fournit les mêmes clés et valeurs par défaut au serveur et à l’interface. Les comptes existants conservent leurs accès antérieurs : pour un collaborateur sans configuration, salariés, tamponnage et facturation sont désactivés. Aucune attribution réelle n’est modifiée par le déploiement.

Les droits sont stockés dans `auth.accounts[email].access`, normalisés dans `portal_accounts.data_json`. Aucun changement de schéma. Les invitations et réinitialisations conservent les droits configurés. L’API d’administration exige un administrateur et une version `If-Match` à jour ; un historique privé enregistre les modifications.

La session relit les droits à chaque requête. Les routes directes Budgets, Sheets, Agenda et Marchés sont contrôlées avant les anciens handlers ; les API Facturation, Tamponnage et Projets vérifient aussi leurs droits. Le portail filtre les collections, les écritures et les fichiers référencés ; le tableau de bord ne renvoie pas les résumés des modules désactivés. Un rechargement/synchronisation actualise les menus et ferme la rubrique devenue inaccessible.

L’accès à une rubrique ne transforme pas un collaborateur en administrateur : ses mouvements, notes de frais et données salariales restent limités à son dossier. L’onglet Salariés délégué est en lecture seule. La validation des congés, les comptes, les sauvegardes et la configuration globale restent administratifs. La facturation déléguée comprend clients, catalogue, devis, factures importées, marchés et projets. Le tamponnage reste isolé par propriétaire de lot.

Les données personnelles CET sont partagées en lecture entre mouvements, agenda et fiche salarié pour calculer les soldes correctement. Les écritures de mouvements restent soumises au droit CET. La génération des mouvements issus de congés validés reste du ressort des administrateurs. Le répertoire clients est partagé entre budgets et facturation sans ouvrir les budgets complets.

Validation : `account-access-test.mjs`, `account-access-ui-test.mjs`, `account-roles-test.mjs`, `portal-test.mjs`, `stamping-portal-test.mjs`, `sheets-branding-test.mjs`, compilation TypeScript et builds. Tests sur bases temporaires ; aucune modification des comptes de production.
