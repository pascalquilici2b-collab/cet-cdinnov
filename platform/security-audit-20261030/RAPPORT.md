# Contrôle de sécurité et de cohérence — 30 octobre 2026

La revue a couvert le portail CDInnov, les droits par application, la facturation, les marchés et engagements, les imports documentaires, le tamponnage, les échanges Outlook, les dépendances et la surface publique. Plusieurs agents ont partagé l'implémentation, la recherche de défauts et la vérification indépendante. Base examinée : `493f91b`.

**Résultat : deux familles de défauts ont été corrigées et testées. Des risques résiduels restent ouverts, en particulier deux avis concernant Ghostscript. Ce contrôle ne constitue ni une certification ni une garantie d'absence de vulnérabilité.**

## Corrections

| Élément | Correction et vérification |
|---|---|
| Sessions du portail | Suppression d'une empreinte lisible qui pouvait permettre des essais de mot de passe hors ligne à partir d'un ancien jeton copié. Liaison protégée par un secret serveur ; anciens jetons refusés ; tests de connexion, révocation, droits et vrai navigateur réussis. |
| Sessions du service Factur-X | Même renforcement de la liaison au compte avec un format de session renouvelé. Les anciennes sessions sont refusées, les nouvelles connexions gardent la même interface. Revue indépendante supplémentaire du parcours navigateur et serveur. |
| Confidentialité de l'aide IA aux tableaux de paiement | Les titres libres des feuilles ne partent plus vers le modèle ; ils sont remplacés par des identifiants temporaires, restaurés localement. Les sommes écrites avec « EUR » sont aussi masquées dans les exemples de structure. Les montants réels sont toujours relus depuis le fichier original. |
| Processus natif de conversion | Ghostscript reçoit seulement un environnement minimal, sans les secrets applicatifs ni les options injectables par `GS_OPTIONS`. C'est une protection supplémentaire, pas une correction des failles natives ni un isolement système complet. |

**Après publication, une reconnexion est nécessaire dans le portail et, s'il est utilisé séparément, dans le convertisseur Factur-X.** Aucun mot de passe ni droit utilisateur n'est modifié.

Voir les preuves et limites détaillées dans [la revue des accès](access-review.md) et [la revue des documents et intégrations](documents-integrations-review.md). Les reproductions utilisent des comptes, documents et destinataires fictifs ; aucun message Outlook réel n'a été envoyé.

## Contrôles réalisés

- Droits : matrice de 20 routes, accès anonyme refusé, révocation immédiate des droits du portail, exports réservés aux administrateurs, protection des données personnelles et des mutations. Tests de connexion et déconnexion multi-onglets dans un vrai navigateur local.
- Documents : archives ZIP et fichiers Office, limites de décompression, actions actives des PDF, aperçus, échappement HTML/CSV, pièces jointes et contrôles avant envoi Outlook. 51 tests Python documentaires réussis, plus les tests dédiés aux sessions et à l'environnement du processus natif. Les appels Graph et IA ont été simulés.
- Parcours IA : test du Worker avec le véritable lecteur Python ; montants et octets source conservés, propositions non confirmées automatiquement.
- Dépendances : l'audit du verrou JavaScript ne signale aucun avis connu ; la consultation OSV pour les 37 versions Python verrouillées n'en signale aucun. Ces résultats ne couvrent pas les logiciels natifs Debian.
- Secrets : aucun candidat dans les 2 297 objets texte examinés avec les motifs du scanner ; cette recherche bornée ne garantit pas la détection de tout secret.
- Production, en lecture seule : neuf routes privées renvoient `401` sans connexion ; l'origine étrangère testée est refusée ; les chemins `.env`, `.git/config` et des preuves privées ne sont pas exposés ; le moteur documentaire exige une authentification.

Les preuves privées sont conservées dans `platform/.private/security-audit-20261030/`. Les anciens tests qui attendent volontairement les sessions historiques ne sont pas déclarés réussis. Les limites natives Linux doivent être vérifiées par les contrôles obligatoires de construction de l'image Render ; un succès local sous Windows ne les prouve pas.

## Points encore ouverts

1. **Ghostscript : avis natifs non résolus.** Les avis CVE-2026-112922 et CVE-2026-110133 concernent des chemins de traitement utilisables dans les PDF. Le contrôle des versions Debian, `-dSAFER`, la restriction aux PDF et l'environnement minimal ne permettent pas de les annoncer corrigés. Vérifier une version corrigée avant de clôturer ce point ; un isolement plus fort du traitement documentaire reste à étudier. [Suivi officiel Debian](https://security-tracker.debian.org/tracker/source-package/ghostscript).
2. **Protection du navigateur.** Les jetons restent accessibles au JavaScript de l'application. Une future faille XSS du même domaine pourrait donc les compromettre. Une migration vers des cookies HttpOnly demanderait une évolution du mécanisme de session, du domaine et des échanges navigateur. [Guide OWASP des sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
3. **En-têtes de l'hébergement statique.** Les trois pages d'entrée ont une politique CSP dans leur HTML, mais les réponses observées n'ajoutent pas les en-têtes HTTP CSP, HSTS, nosniff et Permissions-Policy souhaitables. En particulier, une CSP HTML ne peut pas imposer `frame-ancestors`. La protection de l'API est distincte ; une évolution du frontal d'hébergement serait nécessaire pour ces en-têtes. [Référence MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
4. **Authentification autonome du convertisseur.** Les comptes du service Factur-X restent gérés séparément de ceux du portail. Son effacement de session côté navigateur n'est pas une révocation serveur ; une copie d'une session encore valide peut rester utilisable jusqu'à son expiration, sauf changement du compte ou du secret côté service. Les tests de révocation immédiate du portail ne doivent pas être extrapolés à ce service.

Aucun forfait, région, ressource d'hébergement, consentement Microsoft ou permission externe n'a été changé. L'historique d'intrusion, les configurations privées des comptes fournisseurs et un test d'intrusion exhaustif ne font pas partie des résultats établis.

## Interface et liens entre données

La proposition B est conservée : commandes regroupées sous leur marché, en-tête bleu plus contrasté, lignes distinctes et accès directs « Bons de commande » et « Marchés globaux ». La gestion « Marchés et contrats » reste accessible. Les tests d'interface couvrent les deux accès, leur synchronisation, le clavier, les modes clair et sombre et les largeurs 390 et 1 400 pixels ; les textes contrôlés dépassent le contraste 4,5:1, sans débordement horizontal ni erreur JavaScript observée.

L'identifiant opaque affiché pour l'Office de tourisme provenait de deux fiches portant le même nom et le même SIRET. Elles partagent désormais une entrée de filtre. Les identifiants d'origine et tous les rattachements aux documents et marchés sont conservés : aucune fusion ni suppression de fiche n'a été effectuée. Les établissements aux SIRET distincts restent séparés, même avec un même SIREN. Les véritables homonymes sans identification suffisante reçoivent un libellé lisible, sans UUID.

Cette projection a été testée sur des données fictives puis vérifiée en lecture seule sur les données présentes. Le parcours d'ajout au carnet clients depuis les coordonnées modifiées dans l'éditeur, livré précédemment, reste couvert par les tests correspondants. Les captures locales utilisent exclusivement des données fictives.
