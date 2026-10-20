# Catalogue de prestations — 20 octobre 2026

## Interface

- « Ajouter depuis le catalogue » utilise le bouton bleu principal.
- Les prestations s’affichent sans monogramme ni référence technique sous leur nom, dans le catalogue et dans le sélecteur. Les logos clients restent présents.
- Les références restent enregistrées, modifiables dans les fiches et recherchables. Les tarifs, unités et descriptions copiés dans les documents sont inchangés.
- Recherche avec loupe, survol et focus bleus, ajout indiqué par un plus et modification par un crayon accessible.
- Flèche bas depuis la recherche, flèches haut/bas entre les résultats, Entrée pour sélectionner. Échap ferme le dialogue et rend le focus au bouton initial. Les boutons conservent leur navigation native avec Tab.
- Ouverture du dialogue en 200 ms ; animation désactivée lorsque l’utilisateur préfère réduire les mouvements.
- Recherche initiale corrigée pour ne pas ramener une pagination rapide à la première page.

## Inspiration

Le MCP 21st.dev n’était pas exposé dans la session. Consultation du catalogue public :

- [Command palettes et recherche](https://21st.dev/community/components/explore/react-command-palette)
- [Guide des palettes de recherche](https://docs.21st.dev/blog/react-command-palette-components)

Principes adaptés au design Apple existant : recherche prioritaire, sélection au clavier, feedback discret, boutons explicites. Implémentation locale avec React, Lucide et CSS déjà présents ; aucune nouvelle dépendance.

## Vérification

- TypeScript et compilation de l’application réussis.
- Vérification avec le vrai Worker et une base temporaire contenant onze prestations fictives.
- Catalogue et sélecteur vérifiés à 1440, 390 et 320 px, en clair et sombre, sans débordement horizontal.
- Pagination, recherche par référence, consultation de la fiche, sélection clavier, retour du focus, mouvement réduit, copie du tarif et de la description vérifiés.
- Aucun changement des prestations enregistrées pendant le parcours ; aucune erreur JavaScript.
- Captures et résultats locaux : `platform/.private/catalogue-polish-20261020/`.

La version des ressources de facturation devient `catalogue-20261020`. Le module Marchés est reconstruit pour pointer vers le nouveau fragment partagé d’icônes.
