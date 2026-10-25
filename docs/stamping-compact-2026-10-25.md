# Tampon compact, navigation et export

- Moteur `stamping-2.3-20261025` : largeur initiale 180 pt au lieu de 290, en-tête centré avec retours à la ligne, colonnes rapprochées de 8 pt, Montserrat 5 / 5,6 pt conservée. Les annexes utilisent aussi la largeur choisie. Les originaux et sorties déjà validées ne sont pas modifiés.
- Le nom d'une pièce ouvre exclusivement son PDF original en défilement multipage. Son état ouvre le contrôle et la validation du tampon.
- « Importer une nouvelle pièce » reste disponible à côté de l'analyse, y compris dans un lot déjà tamponné. Limites et dédoublonnage inchangés.
- Exports RH : `DR_EPCIC_RH_<agent>_<Mois>_<année>.pdf`. Identité et période du rapprochement confirmé prioritaires ; dossiers par agent pour un export réunissant plusieurs salariés ; suffixes en cas de doublon. Les factures de prestations conservent leur nom avec « tamponné ». Le ZIP contient uniquement les copies validées.
- Confirmations de facturation : bouton vert avec coche animée et libellé après succès réel. Contraste clair/sombre, largeur stable, clavier et réduction des animations pris en compte. Une confirmation reste près de l'action lorsque le formulaire ferme. Les erreurs ne déclenchent pas de succès.

Vérifications : 74 tests Python, intégration Worker/D1/R2 avec moteur réel, séparation des aperçus, import après tamponnage, noms/dossiers et collisions, parcours de facturation et confirmations après sauvegarde/échec. Données et configuration sauvegardées avant publication.
