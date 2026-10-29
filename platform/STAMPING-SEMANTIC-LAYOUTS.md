# Lecture adaptative des documents de paiement

Le moteur commence par une lecture déterministe des structures reconnues. Pour les autres feuilles ou tableaux PDF, Qwen propose une organisation : orientation, en-tête sur une à trois lignes, colonnes de données, contexte constant et colonnes par projet. Les noms de colonnes peuvent varier ; aucune position fixe n'est imposée.

En RH, les champs recherchés sont agent, mois du bulletin, projet, coût employeur mensuel et montant rendu compte sur le projet. Le dernier est le montant du tampon. Les taxes, abattements, compensations, nets payés et dates de virement ne sont pas des substituts. Aucun calcul depuis un taux n'est autorisé par le parcours sémantique.

L'IA reçoit un échantillon borné de structure, avec les cellules numériques masquées et les identifiants bancaires/sociaux filtrés. Elle ne retourne pas de montants : seulement des positions et des citations exactes de cellules pour les constantes. Le moteur relit les valeurs du fichier original et applique les contrôles de montants, de provenance et de doublons. Les propositions passent toujours par la confirmation habituelle de l'utilisateur.

Les tableaux transposés, en-têtes superposés, cellules fusionnées, projets constants dans une introduction et matrices avec plusieurs colonnes projet sont pris en charge. Une séparation vide interrompt la propagation d'un bloc. Une feuille omise, ambiguë ou illisible reste à préciser et empêche de valider silencieusement une lecture partielle. L'absence de quota ou d'IA conserve la lecture classique et les corrections manuelles.

Limites : la reconnaissance n'est pas garantie pour tout document possible. La qualité de l'OCR reste nécessaire ; les propositions sont bornées à 8 tableaux par appel, 700 cellules échantillonnées par tableau et 28 ko de contexte. Les limites existantes de fichier, mémoire, temps de traitement et budget quotidien restent appliquées. Le système ne devine pas les champs absents.

Validation : variantes synthétiques de vocabulaire et disposition, montants relus à la source, tableaux PDF et Excel, contexte hors grille, absence de calcul implicite, propositions inventées ou contradictoires rejetées, blocage d'une lecture partielle, correction manuelle d'une ligne, confidentialité des extraits, indisponibilité/quota, intégration Worker → proposition IA simulée → moteur Python réel. Aucun message ou document client n'est envoyé par ces tests.
