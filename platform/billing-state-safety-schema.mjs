import {activeInvoiceReplacementSQL} from './billing-rectification-state.mjs';

/** Explicit, replayable migration. Apply this list in one D1 batch: replacing
 * guards must never leave a window without protection or change history. */
export const billingStateSafetySchema=[
 'DROP TRIGGER IF EXISTS billing_payment_rectification_guard',
 `CREATE TRIGGER billing_payment_rectification_guard BEFORE INSERT ON billing_payment_operations WHEN EXISTS(
 SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=NEW.document_id AND ${activeInvoiceReplacementSQL()})
 BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT'); END`,
 'DROP TRIGGER IF EXISTS billing_rectified_invoice_delivery_guard',
 `CREATE TRIGGER billing_rectified_invoice_delivery_guard BEFORE INSERT ON billing_email_deliveries
 WHEN NEW.state IN('sending','sent','unknown') AND EXISTS(SELECT 1 FROM billing_invoice_rectifications r WHERE r.original_id=NEW.document_id AND ${activeInvoiceReplacementSQL()})
 BEGIN SELECT RAISE(ABORT,'BILLING_RECTIFICATION_CONFLICT'); END`,
 `CREATE TRIGGER IF NOT EXISTS billing_trashed_payment_guard BEFORE INSERT ON billing_payment_operations
 WHEN EXISTS(SELECT 1 FROM billing_document_trash t WHERE t.document_id=NEW.document_id)
 BEGIN SELECT RAISE(ABORT,'BILLING_TRASH_CONFLICT'); END`
];
