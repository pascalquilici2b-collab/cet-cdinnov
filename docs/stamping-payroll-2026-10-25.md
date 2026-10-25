# Coût employeur mensuel et rubriques du tamponnage

## Règle de rapprochement RH

Le « montant mensuel versé par l’employeur » du document de paiement correspond au salaire brut chargé du bulletin du même salarié et du même mois.

1. Lire en priorité le total explicitement versé par l’employeur, avec ses variantes de libellés (montant total/mensuel, coût employeur, salaire brut chargé).
2. À défaut, additionner le salaire brut du mois et le total des charges/cotisations patronales de ce mois. La part employeur peut être reconnue dans un tableau grâce à son en-tête et à l’alignement de sa colonne.
3. Les cotisations salariales, le net, les bases de cotisation, les taux et les cumuls annuels ne remplacent jamais ces éléments. Des valeurs contradictoires ou des colonnes ambiguës imposent une relecture manuelle.
4. Le résultat doit toujours coïncider au centime avec le montant de référence du document de paiement. Les montants imputés par projet proviennent de ce document ; ils ne sont pas recalculés depuis le salaire.

La provenance et les deux composantes du calcul sont conservées. L’aperçu affiche une ligne compacte « Brut … + charges patronales … » lorsqu’un calcul a été nécessaire. La version de lecture change, ce qui interdit de réutiliser une ancienne extraction lors du prochain recalcul. Les résultats historiques ne sont pas modifiés silencieusement.

## Navigation

L’entrée de l’application présente deux choix : « Ressources humaines » et « Prestations de services & équipements ». Les nouveaux lots mémorisent leur rubrique. Les anciens sont classés à la lecture d’après leurs pièces de paiement ; un ancien lot mixte reste accessible dans les deux rubriques, sans réécriture de ses données. La navigation retour conserve la rubrique.

## Vérifications

- 69 tests Python : libellés, total prioritaire, calcul mensuel, tableau à parts salariale/patronale, cumuls annuels, ambiguïtés et préservation du PDF.
- Contrôle local en lecture seule d’un bulletin existant : même total employeur reconnu.
- Tests API de séparation des rubriques et de compatibilité des lots historiques.
- Tests navigateur des deux parcours, des aperçus, des colonnes et des modes clair/sombre/mobile.

Déploiement : moteur PDF, puis Worker, sans migration de base ni changement d’offre ou de configuration d’hébergement.
