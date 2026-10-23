# Interface et gestion des accès — 23 octobre 2026

## Modifications

- Tableau de bord : date agrandie, Poppins 600 hébergée avec l’application (licence OFL), bleu pervenche en mode nuit. Cartes compactes empilées sur téléphone.
- Barre supérieure : bouton de synchronisation avec pictogrammes selon l’état réel (chargement, succès, erreur), focus clavier, animation respectant la réduction des mouvements. Cartouche de dernière mise à jour avec icône de base de données ; auteur disponible au survol.
- Applications : icônes sans carré bleu, facturation ambre, budgets mauve, triangle officiel vert pour CDInnovSheets.
- Agenda : accès aux soldes dans la barre supérieure, à côté de Nouveau congé, portrait du collaborateur filtré ou de l’utilisateur connecté ; traces de pas pour les déplacements à venir. Évènements remplis avec des contours discrets, indigo en mode nuit.
- Comptes et accès : sélecteur Collaborateur / Administrateur, enregistrement immédiat, attente et erreurs affichées. Le dernier administrateur actif ne peut pas être rétrogradé. Les comptes en attente doivent d’abord être activés.

## Autorisations

Le rôle est enregistré dans les comptes existants (`portal_accounts.data_json.role`) ; aucune migration ni modification d’hébergement. Sans rôle explicite, les comptes existants conservent leurs droits historiques. Aucune attribution de rôle n’a été effectuée sur les comptes réels pendant la publication.

L’identité serveur relit le rôle à chaque requête. Portail, facturation, projets, marchés, agenda et tableau de bord suivent cette identité. Les mises à jour des rôles nécessitent un administrateur authentifié, une version courante et une valeur autorisée. Le journal privé des changements est enregistré dans `auth.roleHistory`, atomiquement avec les droits. Les réinitialisations de mot de passe conservent le rôle attribué.

Le navigateur met à jour les accès au chargement ou à l’actualisation. Lorsqu’il détecte un changement de son propre rôle, il vide les vues privées montées et revient au tableau de bord. Un ancien administrateur conserve l’accès à son dossier salarié. Les contrôles serveur sont applicables aux sessions déjà ouvertes.

## Vérification et reprise

- `node platform/account-roles-test.mjs` : refus de l’auto-promotion, protection du dernier administrateur, concurrence, retrait immédiat des permissions sur les anciennes sessions, données métier et mots de passe préservés.
- `node platform/portal-test.mjs` : accès, fichiers privés, invitations, sauvegardes, révocation.
- `node platform/dashboard-test.mjs` : filtrage et chiffres du tableau de bord.
- `node platform/interface-browser-test.mjs` : rendu clair/nuit, mobile, police locale, contrôles de droits via un Worker/D1 temporaire, rétrogradation de soi-même et nettoyage des vues privées.
- `AGENDA_ONLY=1` avec `PORTAL_QA` puis `node platform/agenda-browser-test.mjs` : 7 largeurs, navigation clavier, déplacements CRUD/conflits, congés demi-journées/validation/export, périmètres salarié et déconnexion. L’ancien scénario transversal de ce fichier vise un onglet Factures importées supprimé ; les scénarios agenda sont exécutés séparément des tests dédiés à la facturation.
- Construction et vérification TypeScript.

Inspiration : exemple officiel `button-group-demo` consulté via le MCP shadcn/ui. Contrôles sobres intégrés au thème existant, sans nouvelle dépendance.

Sauvegardes, captures avec données fictives et preuves de publication : `platform/.private/interface-access-20261023/` (ignoré par Git). Publication Worker : `platform/.private/interface-release.mjs`. Vérification des fichiers publics : `platform/.private/verify-interface-release.mjs`. Version des ressources : `portal-access-20261023`.
