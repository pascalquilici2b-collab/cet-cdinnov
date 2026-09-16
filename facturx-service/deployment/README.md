# Service Factur-X en ligne

Le moteur est prévu pour un service Web Docker Render gratuit, région Frankfurt.
Le code est publié dans `facturx-service/` ; utiliser ce dossier comme Root Directory,
avec `Dockerfile`, le contexte `.` et le contrôle de santé `/api/health`.

## Configuration privée

- `FACTURX_API_KEY` : secret aléatoire de 32 caractères minimum, réservé au serveur.
- `FACTURX_USERS_JSON` : comptes autorisés, sous forme `{email: {salt, iter, hash}}`.
  Le mot de passe est vérifié par PBKDF2-HMAC-SHA256. Ne publier ni les empreintes
  ni la clé dans GitHub, les journaux ou le HTML.
- `FACTURX_ALLOWED_ORIGINS=https://app.cdinnov.eu`
- `FACTURX_ALLOWED_HOSTS` : nom du serveur ; sur Render, le lanceur reprend
  automatiquement `RENDER_EXTERNAL_HOSTNAME`.

Le navigateur obtient une session signée de huit heures en présentant le mot de
passe par HTTPS. Le serveur vérifie l'identité, limite les tentatives de connexion
et refuse les traitements sans authentification. Modifier ou retirer un compte
côté serveur révoque ses sessions. Une modification du mot de passe dans l'application
nécessite de mettre à jour sa configuration privée sur Render.

Les fichiers PDF sont traités dans un répertoire temporaire, supprimé à la fin de
la requête. Aucune facture ni configuration privée ne fait partie de l'image.
Le conteneur fonctionne sans privilèges ; une seule opération documentaire est
admise à la fois pour limiter la mémoire. Le moteur conserve les contrôles XSD,
Schematron, règles France, montants, intégration XML et PDF/A-3b via veraPDF.

## Déploiement et vérification

1. Construire l'image sur Render, configurer les secrets privés et vérifier la santé.
2. Vérifier les refus d'accès anonymes et la conversion complète d'un document fictif.
3. Raccorder l'application à l'URL HTTPS effective puis publier l'index.
4. Contrôler lecture, aperçu et conversion depuis le navigateur sans moteur local.

Le forfait gratuit peut se mettre en veille et son réveil peut prendre environ une
minute : https://render.com/docs/free . Aucun abonnement payant n'est nécessaire
pour cette configuration. Un dépôt Git public connecté directement ne déclenche
pas automatiquement les mises à jour ; utiliser Manual Deploy après une évolution
du dossier serveur.

Le paquet est produit par `scripts/build_server_bundle.py` avec une liste explicite
de fichiers autorisés. `Dockerfile` installe les versions verrouillées Python,
Ghostscript, Java 17 et veraPDF 1.30.2 avec vérification SHA-256 de l'installateur.
