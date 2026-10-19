# Audit AGIRIS / Cecurity pour la refonte de la facturation CDInnov

Date de consultation : **20 octobre 2026, Europe/Paris**. Cible : session AGIRIS déjà ouverte par l’utilisateur, origine `https://agiris.cecurity.com`. L’inspection a utilisé REA CLI **6.7.0**, attaché au navigateur existant. La version de l’application visible porte le build `3dab3379` ; l’accueil de son guide indique **3.0.42, septembre 2026**.

Ce rapport ne contient ni numéro de facture, ni nom de client, ni montant, ni identifiant de société ou de session. Les captures REA complètes sont conservées localement dans `platform/.private/agiris-rea/`, répertoire ignoré par Git. Elles contiennent des données du compte et ne doivent pas être publiées avec ce document.

## Conclusion applicable à CDInnov

Le produit réellement ouvert est une **plateforme de dématérialisation et de distribution des factures**. Les écrans visités présentent réception, dépôt, suivi, archivage et annuaire. Ils ne constituent pas une observation de l’éditeur de devis/factures ISANET FACT.

La cible pour CDInnov est donc cohérente : **composer et finaliser les devis/factures dans CDInnov, générer le Factur-X avec le moteur existant, puis remettre la facture à AGIRIS et suivre son traitement**. L’export local et la transmission doivent rester deux opérations distinctes, avec des résultats et des journaux propres. Une transmission automatique reste conditionnée à un contrat d’API vérifié ; aucune interface d’intégration publique ou authentification machine n’a été établie pendant cette inspection.

## Observations directes de l’interface

| Observation | Preuve | Conséquence pour la conception |
|---|---|---|
| La navigation principale distingue factures reçues, factures émises et aide. | E1, E2 | Séparer les flux entrants et sortants. Centrer le nouveau module sur les ventes, sans confondre émission et réception. |
| Dans les factures émises, les entrées visibles sont Dépôt, Suivi, Archivage et Annuaire. | E3 | Prévoir un accès clair à la plateforme depuis le document CDInnov et une référence de suivi externe. |
| Le suivi propose Actifs, À contrôler et Historique. Les filtres visibles sont importation, préparation, pré-distribution, distribution, annulation et erreur. | E3 | Prévoir une file d’attention pour les blocages, distincte de la liste générale et de l’historique. |
| Le tableau sortant possède deux colonnes différentes, État et Statut, ainsi que date de dépôt, type de pièce, référence, destinataire, identifiant destinataire, total et canal. | E3 | Ne pas représenter tout le cycle dans un seul champ `status`. Séparer phase de traitement, retour du destinataire et règlement. |
| Le dépôt autorise la sélection multiple. L’attribut HTML du champ fichier est `accept=".pdf,.xml,.xml"`. L’écran précise que les formats autorisés dépendent de l’administrateur. Le bouton d’envoi est désactivé sans sélection. | E4 | L’extension PDF ne prouve pas qu’un PDF ordinaire est acceptable. Exécuter les validations du format avant de proposer l’export destiné à AGIRIS. |
| Le centre d’aide ouvre un guide sur la même origine, dans un nouvel onglet. Le guide présente des rubriques de vérification, validation par un tiers, encaissement et e-reporting. | E5, E6, E7 | Le compte peut avoir un sous-ensemble des fonctions documentées. Ne pas déduire des droits disponibles de la seule documentation. |

Ces constats sont issus de captures DOM/accessibilité, et non d’un test de dépôt. Aucune facture individuelle n’a été ouverte pour modification. Aucun fichier n’a été choisi, ajouté ou transféré. Aucune validation, déclaration d’encaissement, modification d’annuaire ou communication à un destinataire n’a été exécutée.

## Ce que confirme le guide officiel

Les éléments ci-dessous sont **documentés par AGIRIS/Cecurity**, mais ne sont pas tous vérifiés dans l’abonnement du compte connecté.

- **Dépôt** : rôle de dépôt requis ; prise en charge conditionnée par l’abonnement. Le guide distingue Factur-X, certaines syntaxes XML et des couples PDF avec données structurées. Il exclut explicitement le PDF simple pour les factures émises. Une association PDF/XML exige des noms correspondants. La remise comporte une action d’envoi et une confirmation, puis un résultat de transfert. [Guide Dépôt](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/D%C3%A9p%C3%B4t).
- **Préparation et suivi** : contrôles de fichier, structure et données, règles EN16931, présence du destinataire et d’un canal de distribution. Les étapes de vérification et validation peuvent être activées séparément. La distribution peut inclure une conversion et des services optionnels de scellement ou d’archivage. La plateforme documente les retours de remise, acceptation, rejet, litige et encaissement, ainsi qu’un journal d’événements. Les retours disponibles dépendent aussi du destinataire. [Guide Suivi](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/Suivi).
- **Annuaire** : le destinataire est associé à un mode de distribution ; les informations requises varient avec ce mode. L’interface documentée permet une saisie et un import de clients. Les options de l’abonnement modifient les champs disponibles. [Guide Annuaire](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/Annuaire).
- **Annexes** : leur ajout à la facture dépend d’une option. Le guide les situe à l’étape de vérification et prévoit leur typage. Le canal impose ses propres contraintes. Le relevé d’intervention CDInnov doit donc demeurer une pièce associée identifiable, sans être assimilé au XML fiscal de la facture. [Guide Vérification](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/V%C3%A9rification).
- **Validation par un tiers** : elle dépend d’un rôle et d’une option. Le guide décrit un examen en liste ou en détail, avec justification en cas d’annulation. Cela ne remplace pas la règle d’émission et de numérotation interne de CDInnov. [Guide Validation](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/Validation).
- **Encaissement** : le guide distingue déclaration partielle et déclaration finale, avec ventilation par taux de TVA. Il indique que l’enregistrement est irréversible. Une synchronisation future doit disposer d’une action explicite, d’une protection contre les doublons et d’une preuve de résultat ; une case « payée » ne suffit pas. [Guide Encaissement](https://agiris.cecurity.com/demat/v2/help/docs/Factures-ventes/Encaissement).

Le guide contient des formulations anciennes sur l’attente du portail public et une incohérence de libellé reçu/émis dans la page de dépôt. Il constitue une source fonctionnelle, pas une preuve exhaustive du cadre réglementaire actuel ou des paramètres du compte. Le profil/version Factur-X effectivement accepté reste à faire confirmer ou à éprouver dans un environnement autorisé.

## Architecture recommandée — décisions, non observations d’AGIRIS

1. **Document interne stable** : devis, facture, acompte, solde et avoir ont leur identité propre. La validation CDInnov réserve un numéro de façon atomique et conserve un instantané des parties, lignes, taxes, références et pièces associées.
2. **Production documentaire** : aperçu, PDF lisible et XML doivent dériver du même instantané et du même calcul décimal. Conserver version du générateur, profil Factur-X, empreinte du fichier et rapport de validation. Un export réussi ne vaut pas transmission.
3. **Remise à la plateforme** : créer une intention de transmission distincte, portant une clé de dédoublonnage, l’empreinte du fichier et la référence retournée par le prestataire. Un délai réseau doit produire un état « résultat à vérifier », jamais un faux succès ou une nouvelle soumission automatique sans vérification.
4. **Événements de suivi** : conserver les libellés et codes externes reçus avec leur date et leur provenance. Les associer à une synthèse utilisateur, sans perdre la distinction traitement / réception du destinataire / paiement. Prévoir des codes inconnus et des événements arrivant dans le désordre.
5. **Destinataires et références métier** : distinguer identité légale, adresse de facturation, identifiant de routage et contact. Codes affaires, marchés, contrats, commande client et engagement sont des liens métier ; seuls les champs pertinents sont imprimés ou exportés dans le XML.
6. **Relevés et annexes** : produire un relevé lié à une version de facture et conserver son type et son empreinte. La remise des annexes par AGIRIS devra être validée séparément, notamment pour les marchés publics.
7. **Connecteur durable** : employer l’API officiellement accessible au contrat, côté serveur. Le navigateur utilisateur et sa session CDP servent ici à l’étude ; ils ne sont pas un mécanisme d’intégration de production. En attendant le contrat d’API, l’export Factur-X et une remise manuelle contrôlée restent un parcours vérifiable.

## Frontière de vérification et prochaines preuves

| Question initiale | Résultat |
|---|---|
| Quel produit AGIRIS l’utilisateur consulte-t-il ? | Répondu : plateforme de dématérialisation Cecurity/AGIRIS, build observé. |
| Comment accéder au dépôt et au suivi sortant ? | Répondu par scénarios exécutés jusqu’à l’écran de dépôt vide. |
| Quel format préparer ? | Partiellement répondu : Factur-X documenté, PDF simple exclu par le guide ; profil, version et options du compte non éprouvés. |
| Comment distinguer les statuts ? | Répondu pour les colonnes et phases visibles ; transitions complètes documentées mais non déclenchées. |
| Comment déposer le relevé et les annexes ? | Documenté en option ; activation du compte et résultat de remise non vérifiés. |
| Quelle API et quel mode d’authentification ? | Non vérifié : aucun dépôt API, aucune récupération de jeton, aucun test de webhook. |
| Les contrôles de conformité passent-ils pour un PDF CDInnov ? | Non vérifié : aucun fichier soumis. À tester sur une facture fictive en environnement d’essai autorisé. |
| Le paiement ou l’e-reporting est-il correctement synchronisé ? | Non vérifié : aucun changement de données financières réalisé. |

Avant d’activer l’envoi automatique : obtenir la documentation d’intégration et les droits, choisir un environnement de recette, vérifier les profils et tailles acceptés, le routage des destinataires, la gestion des annexes, le dédoublonnage, les erreurs et les retours de statut. Cette liste concerne la future recette du connecteur, pas des actions déjà réalisées.

## Registre de preuves

Les identifiants ci-dessous désignent les enregistrements complets présents sous `.private/agiris-rea/`. Les scénarios ont effectué uniquement les navigations et lectures déclarées. Les captures passives ne prouvent aucune activité antérieure à leur attachement.

| Alias | Fichier | Evidence ID | Portée |
|---|---|---|---|
| E1 | `01-current-page.json` | `ev_de13b9b242a0fcfa4a811fb66d9711a9e9b1cdd7a6d561c6b88894ca8861ef5c` | Capture passive initiale des factures reçues. |
| E2 | `02-targets.json` | `ev_65add94b05eed1e483a5f436050958fd26f20532bec59eaba73450eb3810322a` | Identité de la cible et de l’origine. |
| E3 | `06-outgoing-scenario.json` | `ev_f0b66eed35c176c472ea1d13aab0b114b0e11345138c514f6c8847463f543f2a` | Ouverture du suivi des factures émises ; DOM et accessibilité. |
| E4 | `07-deposit-scenario.json` | `ev_e22574e15e17fa125b3ab5371af8c20d300f77581e05cf3efe74c08dfc7a753f` | Ouverture du dépôt vide ; aucun fichier choisi. |
| E5 | `08-help-scenario.json` | `ev_d893cd0988001a93d58533d931604bd287b867c55eb3b38d85468fcfc2524a6f` | Centre d’aide. |
| E6 | `11-guide-home.json` | `ev_bb8b28604698b79d4aeb628ce8adcecebcdd3e94f9b13402e3afd843c584e45c` | Accueil du guide et version affichée. |
| E7 | `12-outgoing-guide.json` | `ev_76482a2ea90c9e04f7b5722359dde6679afdb98b5f22bcaf05a241855a2ba860` | Sommaire du guide sortant et liens vers les rubriques officielles. |

Limites techniques conservées : un premier clic ciblant le libellé en capitales a expiré (`03-outgoing-scenario.json`) ; le clic corrigé à partir du texte réel a réussi dans E3. La tentative groupée de consultation du guide (`13-guide-topics.json`) a échoué avant la capture initiale ; les pages utiles ont ensuite été lues par leurs URL publiques. L’ouverture de la recherche avancée (`14-filters.json`, `ev_072565be5cb825e0fc72536ebe767ccef6de89091ebfe4c489b25a91ad33986a`) a expiré ; aucun contenu de filtre déroulé n’est déclaré vérifié. Ces échecs ne sont pas des preuves d’absence de fonctionnalité.

Une navigation complémentaire vers la page Dépôt du guide a changé l’URL, mais sa capture finale montrait encore le sommaire (`15-deposit-guide.json`, `ev_00d19029dc6c3ae9b1298a0da2d25795e25910568af9c048beb116a99e8f1dfc`). L’inspection passive suivante a retourné `target_not_allowed` (`16-deposit-guide-loaded.json`). Aucun accès hors de l’origine déclarée n’a été tenté. Les détails du guide Dépôt sont donc attribués à la lecture de l’URL publique, et non à ces captures incomplètes.

Le réseau n’a pas été rejoué. La présence d’appels internes de configuration observés lors de l’ouverture du guide ne constitue pas un contrat d’API publique. Aucun cookie, valeur de stockage, secret ou en-tête d’autorisation n’a été lu ou exporté volontairement.
