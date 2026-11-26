/** A reserved issuance is immutable even when its document is in the trash.
 * Only an unissued replacement draft can be cancelled through the trash.
 * Aliases are static call-site identifiers, never request parameters. */
export const activeInvoiceReplacementSQL=(alias='r')=>`(EXISTS(SELECT 1 FROM billing_issuances replacement_issuance WHERE replacement_issuance.document_id=${alias}.replacement_id) OR NOT EXISTS(SELECT 1 FROM billing_document_trash replacement_trash WHERE replacement_trash.document_id=${alias}.replacement_id))`;
