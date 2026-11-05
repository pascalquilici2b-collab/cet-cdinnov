# Service Factur-X en ligne

Le moteur est prévu pour un service Web Docker Render gratuit, région Frankfurt.
Le code est publié dans `facturx-service/` ; utiliser ce dossier comme Root Directory,
avec `Dockerfile`, le contexte `.` et le contrôle de santé `/api/health`.

## Configuration privée

- `FACTURX_API_KEY` : secret aléatoire de 32 caractères minimum, réservé au serveur.
- `FACTURX_USERS_JSON` : ancien réglage inutilisé ; les comptes sont désormais
  administrés dans le portail et cette copie peut être retirée de Render.
- `FACTURX_ALLOWED_ORIGINS=https://app.cdinnov.eu`
- `FACTURX_ALLOWED_HOSTS` : nom du serveur ; sur Render, le lanceur reprend
  automatiquement `RENDER_EXTERNAL_HOSTNAME`.

Le navigateur utilise exclusivement la session HttpOnly du portail sur le même
domaine et les routes `/api/v1/facturx/*`. Le Worker contrôle le compte et son droit
Facturier à chaque requête, puis appelle uniquement les opérations documentaires
autorisées avec `BILLING_PDF_SERVICE_KEY` (la même valeur que `FACTURX_API_KEY`).
`BILLING_PDF_SERVICE_URL` désigne ce service HTTPS. Le secret reste entre serveurs.
La déconnexion, la suppression du compte, le changement de mot de passe et le
retrait du droit Facturier sont donc appliqués au convertisseur par le portail.
La connexion directe `/api/auth/login` est fermée (410) et tous les anciens
jetons Bearer sont refusés, même encore valides. Le contrôle de santé reste public.

Les fichiers PDF sont traités dans un répertoire temporaire, supprimé à la fin de
la requête. Aucune facture ni configuration privée ne fait partie de l'image.
Le conteneur fonctionne sans privilèges ; une seule opération documentaire est
admise à la fois pour limiter la mémoire. Le moteur conserve les contrôles XSD,
Schematron, règles France, montants, intégration XML et PDF/A-3b via veraPDF.

## Déploiement et vérification

1. Construire l'image sur Render, configurer les secrets privés et vérifier la santé.
2. Vérifier les refus d'accès anonymes et la conversion complète d'un document fictif.
3. Configurer le Worker avec l'URL HTTPS et le secret du moteur puis publier
   le frontal du portail, avec l'API accessible sur son propre domaine.
4. Contrôler lecture, aperçu et conversion depuis le navigateur sans moteur local.

Le forfait gratuit peut se mettre en veille et son réveil peut prendre environ une
minute : https://render.com/docs/free . Aucun abonnement payant n'est nécessaire
pour cette configuration. Un dépôt Git public connecté directement ne déclenche
pas automatiquement les mises à jour ; utiliser Manual Deploy après une évolution
du dossier serveur.

Le paquet est produit par `scripts/build_server_bundle.py` avec une liste explicite
de fichiers autorisés. `Dockerfile` installe les versions verrouillées Python,
Ghostscript, Java 21 et veraPDF 1.30.2 avec vérification SHA-256 de l'installateur.
La base est `python:3.12-slim-trixie` (Debian 13). Ghostscript est reconstruit en
étape Docker séparée depuis la source officielle Debian
`10.05.1~dfsg-1+deb13u3`, avec les deux correctifs Artifex inchangés pour
`CVE-2026-110133` et `CVE-2026-112922`. Les quatre paquets résultants portent la
version locale `10.05.1~dfsg-1+deb13u3+cdi1` : ce suffixe désigne notre
rétroportage, pas une nouvelle publication officielle Debian. La configuration
Debian et ses tests restent actifs ; seul le profil `nodoc` évite la génération
de la documentation. Les compilateurs et sources restent dans l'étape de build.

Les SHA-256 des sources, des patches et des trois fichiers C corrigés sont
verrouillés dans `deployment/ghostscript/lock.json`. La préparation refuse une
empreinte différente ou un patch incompatible. Le build vérifie ensuite la
provenance, les versions exactes des quatre paquets et les empreintes de
l'exécutable, de la bibliothèque partagée et du profil couleur installés.
La preuve embarquée est `/usr/share/cdi-native-security/ghostscript.json`.
`gs --version` affiche toujours `10.05.1` ; ce numéro seul ne prouve pas le correctif.
Une version Debian ultérieure sera à examiner avant de remplacer ce rétroportage.
Ce verrouillage évite de considérer automatiquement une révision non vérifiée
comme corrigée.

Java 21 doit rester au moins à `21.0.13+9-1~deb13u2` et Tesseract à `5.5.0-1` ;
leurs révisions Debian plus récentes restent acceptées. Pour contrôler l'image
reconstruite sans document privé, exécuter
`python -m deployment.verify_native_packages`.
Les tests obligatoires de sécurité documentaire, conversion PDF/A-3b/Factur-X
et OCR/tamponnage restent exécutés au build sous l'utilisateur non privilégié.
La conversion inclut trois pages, deux polices TrueType incorporées, les accents,
une comparaison visuelle du rendu et les annotations transparentes. Aucune image
ne doit être publiée si un contrôle échoue. Inclure dans le contexte Docker
`deployment/build_ghostscript.py` et tout le dossier `deployment/ghostscript/`,
en plus des vérificateurs déjà prévus. Les sources et patches sont épinglés ;
la base et les bibliothèques système suivent les mises à jour Trixie, donc cette
procédure n'affirme pas une identité binaire entre deux builds à des dates différentes.


## Suivi de conversion

POST /api/facturx/generate?output=stream accepte les mêmes PDF, données et
clé serveur que la réponse JSON habituelle. Le navigateur y accède par
`/api/v1/facturx/facturx/generate?output=stream`. La réponse application/x-ndjson émet
six événements progress (completed 0 à 5, total 6), puis result avec le fichier
validé, ou error sans fichier. Les battements heartbeat ne changent pas la barre.
Le navigateur n'affiche 6/6 qu'après réception du résultat et des sept contrôles
réussis. Une coupure conserve la saisie et n'affiche aucun téléchargement.
Une déconnexion n'autorise pas une seconde conversion tant que le traitement
précédent n'a pas libéré son emplacement. Aucun identifiant de tâche public,
stockage persistant ou point d'accès de suivi anonyme n'est ajouté.
