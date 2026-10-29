# Factures historiques et documents de paiement à projet unique

- Les confirmations d’envoi et de règlement des factures importées sont distinctes de leurs dates historiques. Une confirmation ne crée ni date de paiement ni encaissement fictif. Les filtres, listes et le tableau de bord en tiennent compte.
- Un document de paiement RH peut commencer dans une autre colonne que A et indiquer son seul projet dans son introduction. Une mention explicite et unique est nécessaire ; plusieurs projets ambigus nécessitent toujours une vérification.
- Le montant rendu compte est lu directement, avec l’agent et le mois de la même ligne. Le coût employeur reste la base de rapprochement. Les colonnes de taxe sur les salaires et de compensation ne modifient pas le montant à tamponner.
- « Relire » réutilise le document original enregistré sans remplacement ni confirmation automatique. Les répartitions déjà confirmées et les lots en cours de traitement sont protégés.

Validation : cinq cas de lecture à projet unique, tests existants d’import et d’imputation (16 tests Python au total), relecture intégrée avec moteur réel et contrôle des versions/droits, huit scénarios de tamponnage existants, filtres des factures importées, six contrôles du tableau de bord et compilation TypeScript.

La sauvegarde des données de production et le rapport de confirmation des factures restent dans le dossier local privé de cette intervention, hors Git.
