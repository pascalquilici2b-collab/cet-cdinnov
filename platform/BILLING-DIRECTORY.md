# Clients et catalogue de prestations

Les onglets Clients et Prestations gèrent des fiches réutilisables. L’éditeur ouvre ces répertoires dans un dialogue : recherche, sélection, création et modification restent possibles sans abandonner le document. Une fiche client permet aussi de démarrer directement un devis ou une facture.

## Identité et données

Les clients présents dans `budget_clients` sont proposés avec leur identifiant existant et leur nom. Ils ont une version virtuelle zéro tant qu’aucune fiche de facturation n’est enregistrée. Compléter une fiche crée un profil `billing_directory` sous ce même identifiant, sans changer les données ni la révision de Budgets. Les profils de facturation priment ensuite sur ces entrées virtuelles, y compris après archivage.

Un client créé directement dans la facturation reçoit un UUID et reste dans ce répertoire. Il n’est pas ajouté automatiquement dans Budgets. La synchronisation bidirectionnelle et le rapprochement des nouveaux clients avec d’autres répertoires ne sont pas implémentés. Une fiche contient un destinataire de facturation ; la gestion de plusieurs contacts ou établissements liés reste à approfondir.

La fiche client comprend les coordonnées commerciales et électroniques, les identifiants, les mentions et des notes internes. Le nom est obligatoire ; une adresse encore incomplète peut être conservée. Les contrôles définitifs d’émission continuent de s’appliquer au document. Les notes internes ne sont jamais copiées sur le document.

Une prestation contient nom, description, référence facultative, unité, prix HT exact, catégorie/taux/motif de TVA. La référence est normalisée en majuscules et reste unique, même après archivage. Les prix décimaux sont des chaînes et les calculs utilisent le domaine existant. Un tarif invalide ou en cours de saisie ne peut pas devenir une fiche enregistrée.

## Conservation

Choisir un client copie ses coordonnées et son identifiant dans le brouillon. Ajouter une prestation copie désignation, prix, unité et TVA dans une nouvelle ligne ; la première ligne vide est remplacée. La quantité et le prix peuvent ensuite être adaptés dans le document. Aucun changement de fiche ne réécrit un brouillon enregistré ou un document émis.

Les archives sont exclues des choix courants, restent consultables et peuvent être restaurées. Aucune suppression physique n’est exposée. Les identités, dates de création et historiques sont protégés par les déclencheurs de la base.

## API et migration

`migrateBilling` ajoute explicitement `billing_directory`, `billing_directory_versions`, leurs index et déclencheurs. Les requêtes HTTP ne créent aucune table. Les routes `/api/v1/billing/clients` et `/services` héritent de l’identité et des droits direction de la facturation.

- `GET /clients|services` : recherche littérale, pagination et filtre d’archives ; le tri, le total et la page proviennent de la même requête.
- `GET /clients|services/:id` : fiche actuelle.
- `POST /clients|services` : `{id,data}`, identité choisie une fois par tentative ; une réponse perdue peut être récupérée sans doublon.
- `PUT /clients|services/:id` : `{data}` avec `If-Match`. La version zéro complète un client Budgets encore virtuel ; les autres écritures exigent la version actuelle.

Un conflit conserve la saisie, propose de recharger la fiche ou d’enregistrer une copie. La recherche gère les accents français et la casse sans interpréter les caractères SQL ni les jokers de l’utilisateur. Les appels refusés ne changent pas les documents.

## Vérification

`billing-directory-test.mjs` contrôle les limites du domaine, les identités partagées, les droits, les créations réessayées, les versions concurrentes, les archives, les références uniques et l’immuabilité des documents après modification des fiches.

`billing-directory-browser-test.mjs` parcourt le vrai portail et l’API Worker/D1 avec des données fictives : devis depuis un client, création de prestation et de client dans un dialogue, quantité fractionnée, garde de navigation, conflit, archive/restauration, réponse de création perdue, recherche, thèmes et mobile. Les captures restent privées et la production n’est pas modifiée.
