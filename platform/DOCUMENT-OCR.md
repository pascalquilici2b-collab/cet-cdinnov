# Lecture visuelle des documents

Les quatre extractions métier gardent Qwen3 30B A3B et leurs validations par citations. La nouvelle étape OCR transcrit les pages visuelles avec `@cf/google/gemma-4-26b-a4b-it` via `MARKETS_AI`. Elle ne calcule pas de montant, ne valide pas un contrat et ne reconnaît pas l’identité d’un signataire depuis sa signature.

La priorité exprimée est la fidélité des chiffres et du manuscrit, même avec quelques secondes de plus par page. Sur trois pages synthétiques du comparatif du 7 novembre 2026, Gemma a conservé les références, dates, HT/TTC attendus en 5,7 à 7,4 secondes et environ 13 à 15 neurones par page. Qwen3.8 a donné les mêmes champs attendus sur ces pages, avec environ 235 à 250 neurones et 6,8 à 7,5 secondes. Ce petit corpus ne mesure pas la fiabilité de tous les manuscrits. Ces chiffres ne promettent pas une accélération par rapport à Tesseract ; l’intérêt recherché est la lecture des champs manuscrits que l’OCR classique lit mal.

## Contrat HTTP

`POST /api/v1/ai/ocr-page` est disponible sur la même origine que le portail, avec son cookie de session HttpOnly, le droit Facturier ou Tamponnage et `X-CDInnov-Request: 1`. Le Worker applique les contrôles d’origine habituels. Aucun secret ni jeton de fournisseur n’est transmis au navigateur. La réponse porte `Cache-Control: no-store`.

Le corps JSON contient exactement les champs suivants :

| Champ | Contrat |
|---|---|
| `image` | URL `data:image/jpeg;base64,…` ou `data:image/png;base64,…`, encodage canonique, image de 3 Mio maximum ; aucune URL distante. |
| `page` | Entier de 1 à 150. |
| `width`, `height` | Dimensions entières correspondant aux en-têtes réels de l’image ; côté maximal de 2 560 pixels et surface maximale de 4 millions de pixels. |
| `embeddedText` | Texte PDF auxiliaire, éventuellement vide, limité à 10 000 caractères. Il ne remplace jamais les pixels comme source de transcription. |

Le corps HTTP est aussi borné pendant sa lecture. Le navigateur prépare des JPEG de 2 400 pixels de côté, 4 millions de pixels et 900 000 octets maximum. Le serveur documentaire peut préparer les pages avant de les transmettre au même helper `transcribeDocumentPage`, sans exposer le binding AI au service Python.

Une réponse réussie contient `{text, complete, warnings, model}`. `text` conserve les lignes, colonnes, chiffres, dates et unités visibles. Les zones illisibles ou douteuses restent marquées à leur emplacement et rendent `complete` faux. Une signature graphique seule est signalée ; elle ne rend pas le texte imprimé incomplet. Les réponses tronquées, hors schéma ou excessives sont refusées. La transcription est limitée à 24 000 caractères et les avertissements à 20 entrées de 500 caractères.

Les requêtes anonymes et les droits insuffisants restent des erreurs 401/403. Un quota donne 429 ; une indisponibilité donne 503. Le lecteur conserve son repli Tesseract, mais marque alors la lecture incomplète pour ne pas certifier un manuscrit non lu. Les sessions expirées ne sont pas masquées par un repli local. La saisie et la vérification de l’original restent possibles.

Les PDF avec texte natif exploitable et sans zone visuelle substantielle gardent la voie locale. Le lecteur détecte aussi les PDF mixtes avec un en-tête numérique au-dessus d’un corps scanné et les annotations manuscrites. Les anciennes lectures `ocr` peuvent être relues avec le nouveau moteur ; les corrections manuelles sont conservées. La méthode persistée est `vision`, sans migration de schéma. Une relecture explicite reste disponible ; la version de prompt exposée par `aiStatus` ne constitue pas une version historique persistée des lectures.

## Quota et configuration

OCR et extractions métier partagent le compteur atomique `market_ai_daily`, plafonné à 9 000 neurones par jour UTC. Ce n’est pas un quota séparé par route. Le compte Cloudflare bénéficie de 10 000 neurones gratuits par jour, partagés avec ses autres applications ; les 1 000 neurones de marge ne garantissent pas à eux seuls le respect du plafond du compte. Aucun abonnement ni fournisseur de secours n’est ajouté.

La réserve d’une page Gemma couvre volontairement **tout le contexte du modèle**, soit 256 000 jetons d’entrée et 4 096 de sortie, avec 20 % de marge : **2 927 neurones**. Elle ne prétend pas déduire les jetons visuels des octets du JPEG. Les tarifs du catalogue utilisés sont 0,009091 neurone par jeton d’entrée et 0,027273 par jeton de sortie. Quand `usage.neurons` est fourni, seule la consommation rapportée, arrondie avec une marge de 20 %, reste réservée ; un échec sans décompte conserve la réserve entière. Une consommation rapportée supérieure à la réserve est également inscrite au compteur.

`DOCUMENT_OCR_MODEL` permet une configuration serveur explicite. Le défaut est Gemma ; une valeur inconnue désactive la lecture visuelle. Qwen3.8 reste décrit dans le profil de comparaison, mais sa réserve conservatrice dépasse le plafond quotidien et ne peut pas déclencher d’inférence dans cette configuration. Le modèle texte et ses coefficients existants restent inchangés.

Le délai par page est de 90 secondes maximum. L’orchestration serveur peut le raccourcir entre 1 et 90 secondes, sans paramètre de délai accepté dans le JSON du navigateur. Le helper ne conserve ni image ni transcription et ne les journalise pas ; les lectures métier suivent ensuite leur stockage privé habituel.

## Moteur documentaire et publication

Le paramètre serveur `DOCUMENT_OCR_PDF_BRIDGE=v1` active la lecture visuelle dans le proxy Factur-X et le tamponnage. Il reste désactivé pendant la mise à jour du moteur Render. Publier d’abord le Worker avec ce pont désactivé, puis le commit validé du moteur documentaire ; vérifier `ready` et `document_ocr_bridge=v1` dans sa santé avant d’activer le pont. Cela évite d’exposer le nouveau contrat OCR à une ancienne version du service.

Le moteur Python exporte une page couleur bornée à la fois, sans accès à Workers AI ni clé Cloudflare. Le Worker vérifie l’empreinte du PDF et les indices de page, appelle son binding AI et renvoie la transcription au moteur par la liaison authentifiée existante. Un navigateur ne peut pas fournir `ocrPages` au proxy, y compris lorsque le pont est désactivé. Les parsers PDF restent dans les processus isolés et les PDF portant une signature numérique continuent à suivre les refus existants.

L’orchestration inspecte les pages séquentiellement, avec un délai global de 150 secondes et au plus 12 pages nécessitant une lecture visuelle par opération serveur. Les PDF plus longs, illisibles ou privés de quota demandent une vérification ou un découpage manuel. Factur-X refuse alors le préremplissage avec 422 ; le tamponnage conserve son étape de revue, sans approbation automatique. Une signature graphique seule ne constitue pas une lecture incomplète.

Lors du découpage des lots, le moteur réatteste les lectures par un HMAC lié aux octets de chaque PDF résultant. Ce cache privé ne contient pas la transcription complète et permet au job suivant d’éviter un second appel vision. Une lecture incomplète peut être retentée. Les valeurs natives et visuelles contradictoires restent à corriger manuellement ; les champs métier déjà configurés ne changent pas.

## Vérifications locales

Les tests emploient des données synthétiques et un binding AI simulé :

```sh
node platform/document-ocr-test.mjs
node marches/ai-test.mjs
node marches/ocr-pages-test.mjs
node marches/ocr-page-client-test.mjs
node marches/reader-vision-browser-test.mjs
node platform/billing-engagement-reading-ui-test.mjs
node node_modules/typescript/bin/tsc -p platform/tsconfig.json --noEmit
```

Le test navigateur conserve PDF.js et Tesseract réels. Il couvre les scans, PDF mixtes, logos natifs, images, pages vides, signatures, incertitudes, quota et refus de session. Il ne remplace pas un comparatif d’inférence réelle. `buildOCRInput` exporte le prompt et le schéma exacts utilisés par le binding pour reproduire ce comparatif.

Références : [tarifs Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), [mode JSON Cloudflare](https://developers.cloudflare.com/workers-ai/features/json-mode/), [fiche officielle Gemma 4](https://ai.google.dev/gemma/docs/core/model_card_4).
