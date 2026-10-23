# Activation du module Tamponnage

Ces opérations sont préparées mais n'ont pas été exécutées en production. La section 19 du cahier des charges demande des instructions de déploiement séparées, « sans lancer spontanément des changements de production ».

## Avant activation

Reprendre la branche `codex/tamponnage` depuis ce checkout. Vérifier les nouveaux changements du dépôt distant avant fusion. Conserver la version actuelle du Worker, des fichiers statiques et du service documentaire pour retour arrière. Le `pnpm-lock.yaml` retire des importers pointant vers un chemin machine externe et permet une installation depuis ce checkout isolé ; les versions des dépendances Node ne changent pas.

Le module réutilise les bindings/secrets existants : `BUDGETS_DB`, `CET_FILES`, `MARKETS_AI`, `BILLING_PDF_SERVICE_URL`, `BILLING_PDF_SERVICE_KEY`, sessions/origines du portail. Le modèle et le quota utilisent `marches/ai-domain.mjs` et `market_ai_daily`. Ne pas remplacer la configuration du Worker entier par l'extrait ci-dessous.

## Ordre de mise en service

1. Construire et vérifier d'abord le service documentaire depuis `facturx-service/Dockerfile`. L'image ajoute `openpyxl`, `et_xmlfile`, `pypdfium2`, Tesseract et ses langues. La construction exécute le contrôle Factur-X existant puis `deployment.verify_stamping`, avec un vrai scan fictif. Conserver `FACTURX_MAX_CONCURRENCY=1`. La clé `FACTURX_API_KEY` doit correspondre au secret Worker existant et comporter au moins 32 caractères.
2. Appliquer explicitement `platform/migrations/0003-stamping.sql` à la D1 existante, après vérification de sa cible. Cette migration crée seulement les 4 tables du module, leurs index et le contrôle de quota ; elle ne réécrit aucune table métier. Ne pas exécuter les scripts de fixtures ou de tests contre cette base.
3. Créer une queue `cdinnov-stamping` et son binding producteur `STAMPING_QUEUE`, puis un consommateur sur le Worker du portail. Configurer un traitement séquentiel et un déclenchement quotidien pour la purge.
4. Construire `pnpm build` et `pnpm typecheck`, puis déployer `.build/entry.mjs` avec tous les bindings/secrets conservés. Publier aussi `index.html`, les bundles `platform/*.js`, les CSS et **tous les nouveaux chunks de ce build**. L'ajout d'une entrée React redistribue les chunks partagés ; les autres modules doivent recevoir leurs bundles correspondants.
5. Vérifier le parcours sur un compte administrateur avec documents fictifs : création, import, file, aperçu, approbation et export ; vérifier un refus avec un compte collaborateur. Faire un essai Qwen synthétique réel et constater le modèle/prompt dans la traçabilité. Tester la purge sur un lot synthétique expiré.

Extrait de configuration à fusionner avec les ressources existantes :

```json
{
  "queues": {
    "producers": [{"binding": "STAMPING_QUEUE", "queue": "cdinnov-stamping"}],
    "consumers": [{"queue": "cdinnov-stamping", "max_batch_size": 1, "max_batch_timeout": 0, "max_retries": 3, "max_concurrency": 1}]
  },
  "triggers": {"crons": ["15 3 * * *"]}
}
```

Les paramètres sont ceux de la [documentation officielle Cloudflare Queues](https://developers.cloudflare.com/queues/configuration/configure-queues/). Le cron est exprimé en UTC. Préserver les autres crons existants s'il y en a. Le service peut utiliser un quota de queue dépendant du compte : l'activation de cette ressource n'a pas été effectuée pendant le développement.

Ne jamais exposer le préfixe R2 `stamping/` via un domaine public de bucket. Les téléchargements passent par l'API qui vérifie le propriétaire. Les logs serveur ne doivent pas enregistrer les corps multipart ni les réponses contenant les données documentaires.

## Reprise et exploitation

La queue ne contient que propriétaire, identifiants et version. Un verrou de 5 minutes empêche les traitements concurrents. Après interruption, une lecture du lot transforme un verrou expiré en état à vérifier, permettant la relance. Une réponse temporaire du service provoque une reprise bornée ; les autres erreurs restent attachées à la pièce. Le bouton de tamponnage est idempotent : il publie les octets déjà vérifiés et approuvés.

La suppression pose un verrou d'expiration avant nettoyage pour empêcher un travail concurrent. En cas de problème de stockage, le lot reste inaccessible et le cron reprend sa purge. Le nettoyage retire les lots expirés depuis plus de dix minutes ; au plus 20 lots par déclenchement. Augmenter la fréquence du cron si ce volume est dépassé.

Les tests n'ont pas encore validé le service Docker/Linux, le budget mémoire réel de l'hébergeur, ni l'appel Qwen de production. Ils doivent être confirmés sur l'environnement de recette avant les premiers justificatifs réels. Un petit service peut devoir être dimensionné selon les scans et leur complexité ; l'interface remonte un refus sans produire un résultat incomplet.

## Retour arrière

Suspendre le consommateur de queue, attendre les pièces actives, puis restaurer les versions précédentes du Worker et des fichiers statiques ensemble. L'ajout de l'API au service documentaire est compatible avec les routes existantes ; restaurer son image si nécessaire. Garder les tables et fichiers privés tant que des exports sont nécessaires. Leur suppression n'est pas indispensable au retour arrière et doit être une opération explicite après sauvegarde/export.
