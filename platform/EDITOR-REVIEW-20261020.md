# Revue de l’éditeur et des interactions — 20 octobre 2026

## Revue et choix

| Zone | Constat | Modification |
| --- | --- | --- |
| Factures et devis | Le repli natif changeait immédiatement la hauteur. La validation laissait parfois le focus sur un bouton masqué. | Transition de hauteur, coche bleue, ouverture de la section suivante et focus sur son titre. |
| Correction des champs | Un champ dans un sous-panneau fermé ne pouvait pas toujours recevoir le focus. | Ouverture des panneaux parents avant de placer le curseur. Ce déplacement ciblé est immédiat pour conserver une navigation fiable. |
| Sections validées | Une confirmation doit décrire les données actuellement saisies. | La coche disparaît lorsqu’une donnée de la section change. Les autres sections conservent leur confirmation. |
| Fiches clients, prestations et options de facturation | Plusieurs panneaux secondaires utilisent des ouvertures natives. | Même transition de hauteur et même focus de clavier. |
| Marchés et contrats | Panneaux de preuves et options de lecture ; confirmation d’enregistrement. | Ouvertures harmonisées et confirmation bleue animée. |
| Budgets | Détails des dépenses, propositions comptables, imports et confirmations. | Même animation des panneaux natifs ; coches bleues sur les confirmations existantes. |
| Smartsheet | Fenêtres et navigation déjà harmonisées ; confirmation de réponse à un formulaire. | Animation et couleur bleue de la coche de confirmation. |
| Tableau de bord, mouvements CET, salariés, notes de frais, agenda et paramètres | Les listes et formulaires courts restent plus directs sans étapes supplémentaires. | Revue de l’affichage, du thème et de la navigation avec la couche commune ; aucune étape artificielle ajoutée. |

La confirmation d’une section ne constitue ni un enregistrement ni une émission du document. Les boutons métier et leurs contrôles restent distincts.

## Sources 21st.dev

Le MCP authentifié a été utilisé pour rechercher les modèles de formulaires et de progression :

- [Wizard Steps — ddoemonn](https://21st.dev/@ddoemonn/components/wizard-steps)
- [Multi-Step Form — ravikatiyar162](https://21st.dev/@ravikatiyar162/components/multi-step-form)

Le quota de récupération de code gratuit était épuisé : cette passe consulte les métadonnées et réutilise les enseignements des composants déjà récupérés lors de la passe précédente. Aucun contournement, abonnement ou dépendance ajouté. L’implémentation des transitions reste native et spécifique à CDInnov.

## Connexion shadcn/ui

À la demande de l’utilisateur, le MCP officiel shadcn a ensuite été configuré dans Codex et testé directement avec la version `4.22.1` du CLI. Les appels MCP de consultation d’Accordion et Collapsible, ainsi que de récupération de l’exemple `accordion-demo`, ont abouti.

Le modèle à un panneau ouvert à la fois sert de référence à la revue. La navigation entre les titres avec Flèche haut/bas, Début et Fin complète les contrôles natifs existants. Les composants shadcn déjà présents dans Budgets restent en place. Aucun `init` global susceptible de réécrire les styles de l’application n’a été exécuté. La configuration sera chargée nativement au prochain démarrage de Codex ; le catalogue a été interrogé dans cette session par son protocole MCP.

## Accessibilité et compatibilité

- Contrôles `details`/`summary` natifs ; état développé et lien vers le contenu exposés.
- Champs des étapes fermées retirés de la navigation clavier pendant le repli.
- Focus dirigé vers la section suivante ; validation invalide conservée ouverte.
- Flèches, Début et Fin déplacent le focus entre les titres sans changer les données ni ouvrir un autre panneau.
- Annonce discrète aux lecteurs d’écran, sans ajout de texte visible.
- Préférence de réduction des animations respectée, y compris sur `::details-content`.
- Animation de hauteur activée lorsque le navigateur prend en charge `interpolate-size`; ouverture native immédiate sinon.

## Contrôles

`billing-editor-motion-test.mjs` vérifie les cinq sections des factures et devis, la progression effective de la hauteur, le focus, la correction de champs imbriqués, la réouverture, l’invalidation de la coche après modification et la persistance des lignes et du client après enregistrement.

La revue navigateur du portail couvre les filtres existants et les sections principales en modes clair et sombre, sur ordinateur et mobile. Les tests Budgets et Smartsheet couvrent les vues, l’export Excel et l’enregistrement/rechargement sur données fictives.

Les captures et preuves de contrôle sont conservées hors versionnement dans `platform/.private/editor-motion-20261020/`.

Publication statique uniquement : aucun changement du Worker, des données métier ou du moteur Factur-X.
