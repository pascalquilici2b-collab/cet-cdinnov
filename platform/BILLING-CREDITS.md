# Avoirs liés et acomptes — conception et moteur documentaire

État du 20 octobre 2026 : le moteur natif et les contrats partagés prennent en charge les avoirs ordinaires structurés. Leur parcours métier dans le portail reste à réaliser. Ce jalon ne constitue pas la livraison des avoirs, acomptes ou factures partielles.

## Références vérifiées

- [BOFiP, BOI-TVA-DECLA-30-20-20-20, §220](https://bofip.impots.gouv.fr/bofip/142-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-20-20220119) : référence explicite à la facture corrigée, avec numéro et date.
- [FNFE-MPE, fiche 2026 Avoirs et factures négatives](https://fnfe-mpe.org/wp-content/uploads/2026/09/Fiche_Flash-Avoirs_Facturesnegatives-1.pdf) : avoir ordinaire type 381, montants positifs ; l’avoir sur acompte utilise un type distinct, 503. Ces types doivent être distingués d’une facture négative ou d’une remise globale.
- [FNFE-MPE, fiche 2026 Acomptes](https://fnfe-mpe.org/wp-content/uploads/2026/09/Fiche_Flash-Acomptes.pdf) : acompte avant réalisation, type 386, différent d’une facture intermédiaire. La facture finale reprend les acomptes ; la reprise à la ligne requiert les références détaillées et le profil EXT-CTC-FR. La fiche présente aussi une alternative en pied avec des incidences de TVA à traiter. Ses exemples chiffrés ne sont pas copiés automatiquement : certaines cellules du tableau de l’alternative en pied ne se réconcilient pas arithmétiquement.
- [DGFiP, spécifications externes](https://www.impots.gouv.fr/specifications-externes-b2b) renvoie à XP Z12-012, XP Z12-013 et XP Z12-014. La [fiche AFNOR XP Z12-012](https://www.boutique.afnor.org/fr-fr/norme/xp-z12012/formats-et-profils-des-messages-factures-et-statuts-de-cycle-de-vie-constit/fa301169/601641) indique juin 2026 comme édition en vigueur. Le texte intégral et ses annexes n’ont pas été qualifiés dans ce jalon.

Les deux fiches FNFE-MPE ont été lues depuis leurs PDF officiels. Les copies de travail et extractions sont dans `platform/.private/credit-references/`. La qualification du moteur déployé et du canal AGIRIS reste distincte de cette recherche et des tests locaux.

## Contrat disponible

Un avoir ordinaire conserve `kind: invoice` comme collection documentaire, mais utilise `schemaVersion: 3` et une propriété obligatoire `creditNote` :

```text
invoiceId, invoiceVersion, invoiceNumber, invoiceDate, reason
```

Le numéro et la date désignent la facture d’origine ; les identifiants internes ne sont pas imprimés. Le motif accepte une saisie inachevée en brouillon, puis devient obligatoire au contrôle d’émission. La date de l’avoir ne peut précéder celle de la facture corrigée. Quantités et montants restent positifs ; les lignes corrigées peuvent représenter un avoir total ou partiel, avec plusieurs groupes de TVA.

Les documents v2 existants gardent exactement leur forme JSON : aucune propriété `creditNote: null` n’est ajoutée. Python utilise un sérialiseur lié à la version, et les calculs/empreintes sont comparés à TypeScript. Les documents v1 restent normalisés en v2 comme auparavant. Le v3 n’est pas une conversion automatique des anciennes factures.

Les deux adaptateurs indépendants produisent le type 381 et BG-3 (BT-25 et BT-26). Le motif est inclus dans les notes du XML et dans une section du PDF. Le PDF est titré AVOIR et identifie le montant de l’avoir TTC. La référence, le motif et la version source entrent dans l’empreinte de l’instantané : toute modification invalide l’enveloppe correspondante. Le générateur porte désormais la version `cdi-billing-2`.

Les endpoints de création/modification génériques du portail refusent les avoirs v3. `reserveIssuance` les refuse également tant que le registre d’allocation lié n’est pas installé. Le trigger `billing_credit_unavailable_guard` ferme aussi l’insertion SQL directe, y compris si un écrivain retire la référence d’avoir de l’instantané en conservant une source v3. Il devra être remplacé dans la même migration transactionnelle que les nouveaux contrôles métier ; il ne suffit pas de le supprimer.

## Prochain travail : parcours complet de l’avoir

1. Depuis une facture structurée émise, proposer « Créer un avoir », puis total ou partiel et motif. Lire la source figée côté serveur. Copier les parties et références pertinentes, avec un lien immuable ; afficher la facture corrigée et les montants déjà crédités pendant la prévisualisation.
2. Créer un registre de rattachements et d’allocations par facture et par groupe de TVA, avec liens aux lignes lorsqu’une quantité est annulée. Distinguer ce qui est réservé par une émission en cours de ce qui est effectivement émis. Les brouillons non finalisés ne doivent pas annoncer une réduction du dû.
3. Réserver capacité et numéro dans la même transaction. Deux avoirs concurrents ne doivent pas dépasser le crédit restant. L’échec de génération conserve la réservation et sa reprise ; aucun numéro ni budget ne doit être libéré implicitement.
4. À la disponibilité de l’avoir définitif, réduire le montant exigible de la facture d’origine. Garder son PDF, XML et instantané inchangés. Calculer le reste dû et l’éventuel montant à rembourser à partir du montant net des avoirs et du registre des paiements. Les remboursements réels restent déclarés sur ce registre ; un avoir n’est pas un paiement.
5. Présenter l’avoir comme un document distinct dans les listes et la consultation, avec accès à l’origine et aux autres avoirs liés. Ne pas présenter un avoir comme une facture « à encaisser », ni permettre un paiement ordinaire sur ce document.
6. Traiter explicitement l’effet commercial d’un avoir : réduction de prix, annulation de prestations ou correction suivie d’une nouvelle facture. Ne pas libérer automatiquement des droits de facturation d’un devis pour toute remise de prix. Faire évoluer délibérément l’unicité de conversion complète du modèle actuel.

### Cas des arrondis à résoudre avant fermeture de ce parcours

La somme de TVA d’avoirs partiels calculés séparément peut différer d’un centime de la TVA d’origine. Exemple de test à ajouter : facture de 0,03 € HT à 20 %, TVA arrondie 0,01 €, puis trois crédits de 0,01 € HT. Arrondir chaque TVA indépendamment à zéro ne restitue pas la TVA initiale.

Le registre devra conserver les bases et taxes disponibles et un mécanisme explicite de répartition/ajustement, validé contre les règles du profil. Un dernier avoir doit épuiser exactement le reliquat sans changer silencieusement le prix, le taux ou l’original. Aucun assouplissement des validateurs n’est introduit ici ; le calcul standard actuel reste inchangé. Ce point fait partie des critères de recette, pas d’une restriction finale aux seuls cas simples.

## Acomptes, situations et solde

Le futur parcours doit distinguer avance avant réalisation, facturation intermédiaire de prestations réalisées et facture finale. Les demandes d’acompte et règlements déjà reçus doivent rester traçables, sans présumer qu’un acompte est payé à sa création.

Le modèle cible prévoit plusieurs factures d’acompte liées à une proposition/commande, leur éventuel avoir (503), puis une reprise explicite sur la facture finale, avec ventilation TVA et conservation des références. Les paiements d’acompte ne doivent pas être comptés une deuxième fois dans le suivi de la facture finale.

Le choix de reprise à la ligne et du profil EXT-CTC-FR doit être qualifié avec les capacités réelles du moteur et d’AGIRIS. L’export EN16931 actuel reste utilisé pour les factures et avoirs ordinaires. Ne pas utiliser silencieusement un champ « déjà payé » comme substitut universel au modèle d’acomptes, ni mélanger acompte et facture de situation.

## Preuves de ce jalon

- Build et TypeScript réussis.
- 47 tests Node : contrats ordinaires et avoirs, calculs, API de brouillons et registre d’émission. Les nouveaux contrôles incluent la fermeture HTTP et SQL de l’émission d’un avoir non alloué.
- Suite Python complète : 88 tests et 28 sous-tests réussis, moteurs natifs activés. Après les derniers changements du libellé PDF et de validation du numéro de référence, les 17 tests avoirs/PDF et 28 sous-tests passent de nouveau.
- Avoir total et partiel : PDF/A-3b réels de deux pages, XML embarqué type 381, référence/date source, rapports XSD/Schematron/France/veraPDF valides et quatre fichiers produits. Les fichiers finaux d’essai mesurent 26 893 et 26 878 octets. Les pages du total ont été inspectées visuellement.
- `billing-credit-contract-test.mjs` compare aussi les calculs et empreintes des avoirs multi-TVA entre TypeScript/Python et valide leur XML réel.

Ces tests utilisent des documents et numéros fictifs. Le test natif exerce le moteur sans registre D1 de crédits : il ne prouve pas encore le parcours utilisateur, le plafonnement métier ou l’intégration des avoirs dans les règlements. Aucun déploiement, dépôt AGIRIS ou document réel émis.
