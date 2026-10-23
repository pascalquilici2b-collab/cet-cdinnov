# Prestations du marché dans les devis et factures

- Le marché sélectionné détermine les prestations prioritaires du catalogue. Les autres marchés du client ne se mélangent pas à cette sélection. Sans marché sélectionné, les marchés du client restent proposés.
- Bloc bleu distinct avant le catalogue général, recherche commune, intitulés sans répétition du profil/lieu, prix unitaire HT, taux TVA connu et TTC calculé. Modes clair/sombre et mobile.
- Reprise du tarif HT, du taux TVA renseigné et de l’unité ; quantité et prix librement modifiables. Une prestation sans prix reste sélectionnable pour saisie manuelle.
- Choix d’unités : jour, heure, unité. Les anciens documents conservent leurs unités et libellés ; les anciens tarifs kilométriques restent lisibles.
- Marchés : taux TVA facultatif sur chaque tarif. Lecture Qwen des colonnes HT/TVA/TTC, contrôle des citations et de la cohérence du tableau avant reprise du taux. Les taux déjà saisis restent conservés en cas de désaccord.
- Fusion BPU/DQE : même prestation reconnue même si le profil ou le lieu est répété dans le libellé ; complément des prix/taux vides, conservation des identifiants et des montants manuels.
- Correction OCR : un PDF ne contenant en texte natif que le tampon de réception en préfecture passe désormais en reconnaissance du scan. Les anciennes lectures marquées complètes dans ce cas sont reprises au prochain lancement.

## Vérification

- TypeScript, construction du Worker/React et du lecteur PDF.
- Tests de domaine : six tarifs de l’exemple CAB, quantités décimales, TTC, taux nul/réduit/absent, tarifs sans prix, priorité du marché, recherche, dates, unités historiques, dédoublonnage et taux manuels conservés.
- Parcours navigateur isolé avec Worker/D1 réels : devis et facture, sélection/changement du marché, saisie d’un tarif incomplet, modification du prix/quantité, persistance et captures clair/sombre/mobile.
- Suite IA et import ZIP/PDF/Excel/Word, OCR réel, reprise et conservation des corrections.
- Lecture OCR locale du BPU CAB original : les six montants HT et TTC sont retrouvés, comparaison visuelle au tableau fourni. Les originaux restent intacts.
- Contrôle Qwen réel en production : les six tarifs et leurs taux de 20 % sont reconnus après regroupement des profils renvoyés à la ligne dans le scan. Les propositions sans citation vérifiable restent écartées.
- CAB : TVA et références de pièce ajoutées aux six lignes existantes, sans changer les prix ni les identifiants. Les quatre documents natifs et 1 217 factures importées sont inchangés.

## Publication

Les sauvegardes du Worker et des données, contrôles de publication et lectures CAB sont conservés dans `platform/.private/bpu-catalogue-20261023/`. Aucun changement d’offre d’hébergement ni de schéma SQL.
