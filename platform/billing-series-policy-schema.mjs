import {billingIssuanceSchema} from './billing-issuance-schema.mjs';
import {billingDraftNumberSchema} from './billing-draft-number-schema.mjs';

// Retiring a series only stops new allocations. Its existing reservations and
// issued documents remain immutable and can still be completed or consulted.
const initial=billingIssuanceSchema.find(s=>s.startsWith('CREATE TRIGGER IF NOT EXISTS billing_series_initial '));
const draftGuard=billingDraftNumberSchema.find(s=>s.startsWith('CREATE TRIGGER IF NOT EXISTS billing_draft_number_guard '));
const issueGuard=billingDraftNumberSchema.find(s=>s.startsWith('CREATE TRIGGER IF NOT EXISTS billing_issuance_guard '));
export const billingSeriesPolicySchema=[
 `CREATE TABLE IF NOT EXISTS billing_retired_series(series_id TEXT PRIMARY KEY REFERENCES billing_number_series(id),retired_at TEXT NOT NULL,retired_by TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS billing_default_series(issuer_siren TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('invoice','quote')),series_id TEXT NOT NULL UNIQUE REFERENCES billing_number_series(id),PRIMARY KEY(issuer_siren,kind))`,
 `CREATE TRIGGER IF NOT EXISTS billing_default_series_guard BEFORE INSERT ON billing_default_series BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM billing_number_series s WHERE s.id=NEW.series_id AND s.issuer_siren=NEW.issuer_siren AND s.kind=NEW.kind AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)) THEN RAISE(ABORT,'BILLING_DEFAULT_SERIES_INVALID') END; END`,
 'DROP TRIGGER IF EXISTS billing_series_initial',
 initial.replace('WHERE issuer_siren=NEW.issuer_siren AND kind=NEW.kind','WHERE issuer_siren=NEW.issuer_siren AND kind=NEW.kind AND id NOT IN(SELECT series_id FROM billing_retired_series)'),
 'DROP TRIGGER IF EXISTS billing_draft_number_guard',
 draftGuard.replace('WHERE d.id=NEW.document_id AND d.kind=s.kind','WHERE d.id=NEW.document_id AND d.kind=s.kind AND NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id)'),
 'DROP TRIGGER IF EXISTS billing_issuance_guard',
 issueGuard.replace('AND NEW.sequence_value<=999999999 AND (','AND NEW.sequence_value<=999999999 AND (NOT EXISTS(SELECT 1 FROM billing_retired_series r WHERE r.series_id=s.id) OR EXISTS(SELECT 1 FROM billing_draft_numbers n WHERE n.document_id=NEW.document_id AND n.series_id=s.id)) AND (')
];
