# Vérification guidée dans l’éditeur

Jalon local du 20 octobre 2026, en réponse à la demande d’une interface bien dessinée et intuitive. Aucun déploiement ni changement de données de production.

## Parcours

Un panneau compact au-dessus de la saisie indique les points à compléter. « Vérifier le document » ouvre une liste regroupée par rubrique : document, émetteur, client, prestations et conditions. Chaque point mène directement au champ concerné, ouvre ses sections repliées et place le curseur dans la saisie. Sur mobile, ce lien affiche d’abord l’onglet Saisie, même si l’utilisateur consultait l’aperçu.

Les champs ne sont pas tous signalés en erreur à l’ouverture d’un brouillon. Le message apparaît après avoir quitté un champ ou demandé la vérification complète. La correction retire le message immédiatement, sans déplacer le curseur. Chaque message est relié à sa saisie par `aria-describedby` et `aria-invalid`, en conservant l’aide éventuelle. Les liens sont utilisables au clavier et les champs mobiles ont une taille de texte de 16 px et une hauteur minimale de 44 px.

Les erreurs de quantité, prix, remise et TVA désignent désormais leur champ exact. Une suppression de prestation recalcule les indices : un ancien numéro de ligne ne peut envoyer vers une autre prestation. Les messages distinguent une valeur manquante d’un format invalide.

Le bouton de finalisation propose « Compléter le document » lorsque ces points subsistent. Il ouvre la vérification sans demande d’émission ni consommation de numéro. L’enregistrement d’un brouillon incomplet reste disponible. Lorsque les champs sont renseignés, le texte annonce le contrôle définitif à venir ; il n’annonce ni conformité acquise ni acceptation AGIRIS.

## Frontières techniques

- `inspectBillingReadiness` partage les contrôles des données avec l’adaptateur Factur-X : adresses électroniques et types, identification française, mode de facturation, mentions, IBAN de virement et précision des quantités. Les devis conservent leurs propres contrôles de brouillon ; les exigences d’export de facture ne leur sont pas imposées.
- Les calculs, prix, taux et documents persistés sont inchangés. Les nouvelles métadonnées de chemin d’erreur servent à guider la correction.
- La vérification visuelle est une aide locale. Le précontrôle natif, les règles XML/France, l’attribution atomique du numéro et les contrôles d’archivage restent obligatoires côté serveur.
- Les rejets supplémentaires du moteur natif qui ne fournissent pas de chemin de champ restent affichés dans le panneau de finalisation. Une qualification plus complète de ces diagnostics et une recette utilisateur restent à faire.
- Le contexte de vérification est limité au document en cours ; il ne colore pas les fiches des répertoires ou les paramètres, et il est réinitialisé au changement de document. Les réponses tardives et conflits gardent leurs protections existantes.

## Vérification

- Build et TypeScript réussis.
- 47 tests Node réussis sur contrats ordinaires/avoirs, calculs, API et registre d’émission. Après la précision des messages, 12 tests de domaine réussis, dont deux nouveaux cas de navigation des erreurs et de distinction facture/devis.
- Nouveau parcours navigateur : 11 requêtes vers le Worker/D1 réel ; vérification des erreurs après interaction, aide accessible conservée, ouverture imbriquée, focus clavier, passage aperçu → saisie, suppression d’une ligne, sauvegarde incomplète, remise à zéro de la vérification et absence de réservation. Thèmes clair/sombre à 320 et 390 px sans débordement ni erreur JavaScript/React.
- Régression navigateur des brouillons : 55 requêtes sans erreur JavaScript/React ; saisie, paramètres, conflit, conversion avec réponse perdue, téléchargement et déconnexion.
- Chaîne native complète rejouée : PDF/A–Factur-X de deux pages, XML incorporé, quatre fichiers validés et archivés, un numéro pour deux tentatives. Paiements et correction conservent les fichiers identiques octet par octet. Aucun document réel utilisé.

Le parcours des avoirs liés, leurs plafonds, les acomptes, la vue d’ensemble, la migration et la qualification AGIRIS restent dans le plan global. Ce jalon améliore l’éditeur ; il ne ferme pas l’objectif de refonte.
