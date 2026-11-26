# Régularisation par référence de devis fournie

Les anciens brouillons numérotés peuvent être régularisés par rattachement à un devis présent dans l'application ou par confirmation de la référence déjà enregistrée dans « Affaire, marché et références ». Le deuxième mode affiche le numéro FAC prévu, exige une confirmation explicite et ne crée aucun devis ni lien de provenance artificiel.

Le contrôle préalable est en lecture seule. La confirmation vérifie simultanément la version du brouillon et sa référence, puis ajoute un historique immuable. Le client, la référence et le numéro prévu sont conservés ; les montants, prestations, dates et rattachements métier ne sont pas remplacés. Une référence correspondant à un devis enregistré doit utiliser le rattachement normal.

Les références historiques sans préfixe DEV sont prises en charge. Par exemple, 260318004 donne FAC-260318004. Le préfixe numérique historique est un identifiant opaque : aucune date n'en est déduite. Une série dédiée à ce préfixe évite de confondre son rang 004 avec la numérotation courante. Elle est inaccessible aux choix ordinaires et ne peut pas devenir la série par défaut. Le compteur courant est inchangé par cette régularisation historique.

Les contrôles de collision, de réservation retirée, de chronologie et d'absence de saut restent applicables. Une réservation active du même brouillon peut être conservée uniquement si son tuple est identique. La finalisation reste le moment de l'émission ; aucune facture réelle n'est créée pour les tests.

Validation : parcours UI/API avec données fictives, confirmation obligatoire, référence absente ou déjà connue, annulation sans écriture, modifications concurrentes, double clic, conservation des données métier et des compteurs ; présentation à 390 px ; régression du rattachement interne et intégration locale avec le moteur PDF réel. Les contrôles du livrable compilé et de la connexion sont exécutés avant publication.

Publication : appliquer `billingInvoiceReferencePrepareSchema` (7 instructions), puis `billingInvoiceReferenceActivateSchema` (18 instructions), depuis `billing-invoice-reference-schema.mjs`, dans un unique `D1Database.batch()` avant le Worker et le frontal compatibles. Aucun ledger existant n'est reconstruit. La sauvegarde du schéma et du Worker et les résultats de publication sont privés. Les séries historiques sont créées seulement lors d'une confirmation utilisateur, jamais pendant la publication ou la lecture de l'aperçu.
