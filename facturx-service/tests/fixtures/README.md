# Fixtures communes de calcul et de conversion

`line-discounts.json` contient des cas synthétiques partagés entre `calculateBilling` (TypeScript/BigInt) et `Invoice` (Python/Decimal). `test_line_discounts.py` exécute réellement le moteur Node puis compare les calculs Python aux mêmes résultats attendus.

`invoice-line-discount.json` est une facture synthétique complète : 1,25 × 700 €, remise de ligne de 12,5 %, TVA 20 %, soit 765,63 € HT, 153,13 € de TVA et 918,76 € TTC. Les identifiants servent uniquement aux contrôles de format. Aucun envoi à une plateforme n'est effectué par les tests.

## Remise de ligne conservée dans le XML

Le net de ligne est arrondi **une seule fois**, après multiplication de la quantité, du prix et du complément du taux de remise. La TVA est arrondie sur la base totale de chaque groupe catégorie/taux.

| Champ | Valeur exportée |
|---|---|
| BT-146 | Prix unitaire saisi, sans réduction artificielle |
| BT-131 | Net de ligne arrondi après remise |
| BG-27 / BT-136 | Brut arrondi moins net arrondi |
| BG-27 / BT-137 | Brut de ligne arrondi |
| BG-27 / BT-138 | Pourcentage saisi |
| BG-27 / BT-139 | Motif « Remise de ligne » |

Cette représentation est validée contre les XSD et Schematrons réels fournis par **factur-x 6.8**, pour EN16931 et BASIC. Les cas de demi-centime vérifient l'absence d'arrondi intermédiaire du prix. Les règles Peppol [R040](https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/PEPPOL-EN16931-R040/) et [R120](https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/PEPPOL-EN16931-R120/) documentent une tolérance de 0,02 pour les relations montant/base/pourcentage et net de ligne. Ces pages ne remplacent pas les validations CII/France exécutées localement.

BASIC WL ne contient pas de lignes : une remise de ligne non nulle provoque donc un refus explicite de ce profil. Les anciens payloads sans `discount_percent` gardent le calcul et le XML du taux zéro.

## Contraintes observées dans le Schematron France embarqué

Source : `facturx/xsd_and_schematron/cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt` du paquet 6.8 installé. Les numéros suivants correspondent à cette version, sans supposer une acceptation AGIRIS.

- **BT-23** : liste `B1 S1 M1 B2 S2 M2 S3 B4 S4 M4 S5 S6 B7 S7 B8 S8 M8 B9 S9 M9`, ligne 77. L'assertion `BR-FR-08_BT-23`, lignes 1556–1573, s'applique à `ExchangedDocumentContext` sans condition de TVA ou de type 380/381.
- **BT-49 acheteur** : obligatoire, `BR-FR-12_BT-49`, lignes 1987–2003. **BT-34 vendeur** : obligatoire, `BR-FR-13_BT-34`, lignes 2020–2036. Ces assertions s'appliquent à toute racine `CrossIndustryInvoice` contrôlée par ce Schematron.
- **BT-129 quantité** : au plus **quatre décimales**, selon `custom:is-valid-decimal-19-4`, ligne 142, et `BR-FR-DEC-02_BT-129`, lignes 4753–4775. Le modèle conserve six décimales pour compatibilité de calcul ; les quatre fixtures qui en utilisent réellement six doivent échouer précisément sur cette règle. Aucun arrondi automatique n'est permis pour masquer cet échec. Les zéros décimaux non significatifs peuvent être retirés lors de la sérialisation sans changer la valeur.
- **BT-146 prix** : jusqu'à six décimales, `BR-FR-DEC-03_BT-146`, lignes 4825–4846. Les fixtures prix à six décimales et quantité à quatre passent France.

La suite contrôle aussi la conservation de descriptions de ligne de 4 000 caractères, conditions de paiement de 4 000 caractères et notes globales de 20 000 caractères. Les dépassements sont refusés, sans troncature.

Exécution depuis la racine du dépôt, avec Node disponible et le Python du service :

```powershell
$env:PYTHONPATH='facturx-service'
python -m pytest facturx-service/tests/test_line_discounts.py -q
```

Ces tests couvrent les calculs et le XML. Ils ne constituent ni une validation PDF/A, ni une transmission, ni une acceptation par AGIRIS.
