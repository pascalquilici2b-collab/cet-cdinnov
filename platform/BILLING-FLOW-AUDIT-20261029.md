# Audit des liens entre modules — 29 octobre 2026

Audit réalisé avec trois agents spécialisés, reproductions locales sur données fictives et revue croisée.

## Corrections

| Parcours | Défaut reproduit | Correction |
|---|---|---|
| Clients → Marchés / Projets / facturation | Une création ou un renommage n'apparaissait pas dans tous les sélecteurs | Projection commune des clients, avec priorité à la fiche courante |
| Projets → Marchés | Projet multimarché absent du second marché | Projets liés affichés sans dupliquer le projet ni les bons du marché d'origine |
| Devis → facture → PDF / Factur-X | Références de service pouvant manquer ou provenir d'un ancien bon | Propagation du service, engagement et références ; codes traités comme du texte, zéros conservés |
| Sélection BDC | Bons globaux inaccessibles sans projet | Sélecteur disponible au niveau du marché et préremplissage des références |
| Modification du rattachement | Suivi/budget modifiés mais brouillon/PDF encore sur l'ancien bon ; problème inverse depuis l'éditeur | Transaction unique actualisant le suivi partagé et tous les brouillons actifs de la famille |
| Plafonds | Contrôle sur l'ancien bon ou sur une seule facture | Contrôle du cumul de la famille, annulation intégrale si dépassement ; conflits de version explicites |
| Consommation des marchés | Devis compté sur le marché précédent après correction du lien | Calcul à partir du marché effectif, avec conservation de l'historique annuel et des révisions |
| Rectification | Relevé perdu ; ancien projet incompatible conservé | Reprise indépendante du relevé enregistré ; projet conservé uniquement s'il est compatible |
| Corbeille / restauration | Une facture supprimée pouvait bloquer toute la famille ou revenir avec d'anciennes références | Exclusion des brouillons supprimés de la synchronisation ; restauration atomique avec références actuelles et contrôle du plafond |

## Validation

- Suite locale de 35 tests réussis : API réelle Worker/D1 locale, données fictives, conversions partielles, plafonds, conflits de versions, corbeille, archives et sélecteurs Chromium.
- Test Python d'un PDF réellement rendu et d'un XML Factur-X généré : service `00123`, bon et engagement conservés.
- Contrôles Marchés (35 assertions), Clients, compilation TypeScript et construction de l'application réussis.
- Revue croisée de la transaction, de ses protections de concurrence et de sa restauration.

## Données existantes et limites

Lecture de contrôle : 37 documents natifs, dont 26 finalisés. Aucun brouillon ne présentait de décalage de références au moment de l'audit. Les différences historiques concernent des devis dont le bon a été lié après finalisation et une ancienne facture remplacée ; leurs instantanés ne sont pas réécrits.

Le service est repris lorsqu'il est renseigné ou reconnu dans le bon. Un numéro absent de la pièce n'est pas inventé. Une correction de suivi ne réécrit jamais un PDF déjà finalisé : le parcours de rectification reste nécessaire pour modifier le document lui-même.

Périmètre : clients, marchés, projets, engagements, devis, factures, relevés et exports documentaires. Cet audit ne constitue pas un contrôle exhaustif des modules RH, budget ou tamponnage, ni un test d'envoi réel d'e-mail ou de dépôt AGIRIS.
