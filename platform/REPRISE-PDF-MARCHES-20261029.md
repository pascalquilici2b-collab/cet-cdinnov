# Corrections du 29 octobre 2026

## Travail demandé
- Restreindre le tampon RH aux pages du bulletin, exclure les annexes ; corriger les aperçus du lot de Paul Michel sans modifier les montants approuvés.
- Déplacer le tampon entre pages dans l’aperçu.
- Corriger l’aperçu PDF de l’éditeur et la fermeture PDF.js du lecteur IA.
- Libellé de suivi modifiable pour un devis finalisé, PDF archivé inchangé (confirmé par Pascal).
- Afficher et corriger le rattachement d’engagement depuis la facture, synchronisé avec le devis lié.
- Retirer les faux projets issus des titres de marchés ; compléter les logos identifiés auprès de sources publiques.
- Présenter les marchés par client dans une interface compacte.

## Validation et publication
- Tests ciblés PDF, tamponnage, API de suivi et plafonds d’engagement.
- Vérification dans le navigateur des parcours concernés.
- Publication Worker, site et moteur Render, puis contrôle public.
- Sources de production et sauvegardes dans `.private/pdf-markets-20261029/` (jamais commitées).

## Diagnostic initial
- Le lecteur commun appelait `PDFDocumentProxy.destroy`, supprimé dans PDF.js 6 ; la fermeture appartient à `PDFDocumentLoadingTask`.
- La recherche d’espace libre du tampon parcourait toutes les pages, y compris les annexes fiscales qui répètent l’en-tête du bulletin.
- Le déplacement à la souris était limité aux dimensions de la page de départ.

## Contrôles réalisés
- PDF.js 6 : fermeture via la tâche de chargement, coordonnées par transformation affine ; lecture d’un PDF de commande et aperçu A4 vérifiés dans Chrome.
- 78 tests Python réussis ; les six fichiers réels du lot Paul Michel sont redessinés sans changer leurs imputations ni leur base. Pages autorisées : bulletin uniquement, y compris lecture entièrement corrigée manuellement.
- Tests D1 de suivi : libellé sans modification du PDF, conflits de version, historique immuable, engagement commun à plusieurs factures, refus de dépassement cumulé.
- Tests existants `billing-test.mjs` et `billing-quote-test.mjs` encore obsolètes : attendent conversion sans engagement, conversion unique, absence de suppression et ancien contexte. Les parcours actuels sont couverts par `billing-partial-invoices-test.mjs`, `billing-order-budget-test.mjs` et les nouveaux tests.
- 17 logos officiels ajoutés aux projets ; seul le faux projet explicitement identifié a été retiré après contrôle d’absence de références. Sauvegarde privée des marchés avant modification.
- Retour vers factures/devis et avatar du compte connecté corrigés.
- Acquisition mensuelle : date de démarrage explicite par salarié, ajout de 2,5 jours au 1er novembre en calendrier Paris, contrôles simultanés et rattrapage sans doublon.
- Bulletin septembre de Matthieu vérifié : acquis disponibles 0 ; en cours 8,5. Les quatre autres chemins Moovapps ont disparu ; attente des fichiers permanents et confirmation du bulletin nommé janvier.

## À vérifier après publication
- Déploiements Pages/Worker/Render et correction des cinq aperçus Paul Michel encore sur annexes.
- Interface marchés par client, modification du suivi et déplacement entre pages.

## Publication vérifiée (29/10/2026)
- Interface : commits `98ce837` puis `d4a7448`, Pages construit et Actions réussies. Contrôle des 13 premiers fichiers puis des 3 derniers fichiers : contenus publics identiques.
- API Worker : version publiée, SHA256 `f6a0df364208e36136840f1b709369bd294eed0617e87c623a7708eb26232e4a` ; 21 instructions de migration réussies, historique et plafonds conservés.
- Moteur PDF Render : commit `98ce837` affiché Live / Deploy succeeded. Aucun changement de forfait ou de région.
- Production Paul Michel : les cinq aperçus sur annexes sont corrigés via le parcours normal de révision ; janvier, février, octobre et novembre sur page 1, décembre sur page 2. Mars était déjà sur l’unique page. Comparaison des allocations, bases et empreintes originales : inchangées. Les aperçus révisés sont à valider, jamais approuvés automatiquement.
- Déplacement entre pages testé sur décembre : pages 1 et 2 accessibles, pages 3 à 6 marquées annexes et désactivées. Test annulé pour conserver le placement automatique contrôlé.
- Formulaire du libellé de suivi d’un devis finalisé et sélecteur du rattachement de facture ouverts en production ; contrastes contrôlés, aucune modification des documents réels pendant ces vérifications.
- Avatar testé avec session Pascal et filtre David : avatar Pascal conservé. Solde Matthieu vérifié dans l’écran des soldes : 0 / 8,5 jours.

## En attente utilisateur
- Quatre bulletins Moovapps ne sont plus présents aux chemins temporaires fournis. Il faut des copies dans un dossier permanent pour Pascal, David, Albert et Paul-Michel. Le fichier initial nommé 012026 nécessite confirmation de la période.
- Seul Matthieu a une base de septembre vérifiée et une prochaine acquisition configurée au 01/11/2026 (+2,5). Ne pas présenter les autres soldes comme mis à jour.
