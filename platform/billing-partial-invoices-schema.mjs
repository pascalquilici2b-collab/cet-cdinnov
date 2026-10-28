import {revisionInactive} from './billing-revision-schema.mjs';

// One accepted proposal may be billed in several instalments. Each invoice keeps
// its own immutable source link; acceptance and current-version guards stay on.
export const billingPartialInvoicesSchema=[
 'DROP INDEX IF EXISTS billing_one_full_conversion',
 'CREATE INDEX IF NOT EXISTS billing_quote_invoices ON billing_documents(source_document_id) WHERE source_document_id IS NOT NULL',
 'DROP TRIGGER IF EXISTS billing_revision_conversion_guard',
 `CREATE TRIGGER IF NOT EXISTS billing_revision_conversion_guard BEFORE INSERT ON billing_documents WHEN NEW.source_document_id IS NOT NULL AND ${revisionInactive('NEW.source_document_id')} BEGIN SELECT RAISE(ABORT,'BILLING_REVISION_INACTIVE'); END`
];
