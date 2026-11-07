# Fiabilité de la lecture et du placement des tampons

L’évolution du 7 novembre 2026 complète la lecture visuelle Gemma déjà publiée.
Elle ne change aucun modèle, prompt, tarif ou plafond Workers AI et ne déclenche
aucun appel IA supplémentaire. Les corrections concernent le moteur PDF local
et la validation des suggestions de préremplissage.

## Placement

Le moteur essaie les largeurs compactes sur la page préférée avant de passer à
la suivante. Il peut répartir les projets en blocs de trois, deux ou une ligne,
en conservant leur ordre, leurs montants et la police prévue. Les annotations,
signatures graphiques et logos restent protégés. Les transformations des objets
imbriqués dans les PDF sont appliquées à leurs vraies coordonnées de page.

La recherche exacte des rectangles libres utilise des opérations sur des bits,
avec un second contrôle indépendant par découpe du masque. Elle conserve une
marge de sept points et un maximum de 1 024 recherches par pièce pour laisser du
temps aux vérifications finales du PDF. Elle ne supprime aucun pixel occupé.

Les dégradés légers de papier clair peuvent être reconnus par un modèle linéaire
borné, confirmé sur les bords et dans la page. Ce modèle sert uniquement au
repérage des zones libres : il ne retouche ni le PDF d’origine, ni les pixels
envoyés à l’OCR. Un papier bruité ou un fond non reconnu conserve le chemin
conservateur. Les sondes indépendantes conservent les traits testés d’au moins
4 niveaux de contraste sur 255 ; les traces de contraste 3 ne sont pas toutes
détectées. Ce n’est pas une garantie universelle sur les écritures très pâles.

Le corpus synthétique, les attentes par cas et les mesures avant/après sont dans
`facturx-service/tests/fixtures/stamping-placement-20261107.json`. Il distingue
les placements produits, la page choisie, les collisions, les pixels source
préservés et le refus attendu quand aucune place n’existe. Son résultat ne doit
pas être présenté comme une note de qualité sur tous les documents réels.

Le chevauchement nécessite toujours l’autorisation existante. Une annexe ne peut
être ajoutée que si elle est autorisée et reste interdite pour un bulletin de
paie. Les cas non résolus demandent une vérification ou un placement manuel.
Le refus des PDF chiffrés, actifs ou portant une signature numérique est conservé.

`placementVersion` et la métadonnée PDF `/CDIStampPlacementVersion` identifient
le placement. La version de lecture reste séparée pour réutiliser les lectures
attestées existantes sans refaire l’OCR. La santé du service expose le marqueur
`stamping_placement_version` pour vérifier la publication.

## Informations extraites

Une suggestion d’engagement doit prouver le rôle de la valeur sur sa ligne ou
dans sa cellule : total HT, date du bon, engagement Chorus, marché ou service.
Un TTC voisin ne devient pas un HT ; la date générique d’une facture ou d’une
signature jointe ne devient pas celle du bon de commande.

Pour les lectures OCR de factures, le mode conservateur omet les IBAN et SIRET
contradictoires, avec un avertissement. Il sépare les identifiants de l’acheteur
de ceux du vendeur. Les dates de commande, livraison, signature ou notification
ne remplacent pas la date d’émission de la facture. Une date sans contexte
suffisant ou des dates d’émission contradictoires demandent une vérification.
Le comportement historique hors mode conservateur est maintenu.

## Vérification

Les tests utilisent des PDF et tableaux fictifs, sans document métier réel,
e-mail ni inférence réseau. Les tests de géométrie ont un oracle indépendant
des fonctions de recherche et incluent les formes imbriquées, rotations,
recadrages, zones étroites, signatures et choix de page. Les parcours navigateur
locaux vérifient l’aperçu, le déplacement, l’invalidation de l’ancienne
approbation et le téléchargement du PDF effectivement approuvé.

Les deux anciens tests de page dense interdisent explicitement le découpage
lorsqu’ils vérifient le refus ou le chevauchement : le moteur amélioré trouve
désormais des places libres pour plusieurs petits blocs. L’ancienne attente
d’annexe sur un bulletin de paie a été alignée sur l’interdiction déjà présente,
et le cas d’annexe autorisée reste testé avec une facture.
