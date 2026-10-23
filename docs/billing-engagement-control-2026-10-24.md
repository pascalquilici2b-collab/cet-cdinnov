# Engagement tracking and purchase-order ceilings

The engagement view shows each received purchase order with billed HT consumption, the remaining balance and saved drafts reserved against that balance. Global orders remain one commitment shared across their projects. Market consumption remains based on sent/accepted quotes, as requested.

Historical links were applied only after matching invoice evidence. Ambiguous records carry `orderLinkReview`, displayed in a collapsed review panel; adding an explicit order link removes the item from that panel. Original invoice values and files are preserved. Audit evidence, original database snapshots and the private review report are in `.private/engagement-reconcile-20261024/` and excluded from Git.

## Enforcement

- `billing_order_limits` and `billing_order_allocations` use integer cents HT, combining native invoices and imported records.
- Native creation, modification and quote conversion check capacity inside the SQL write, so simultaneous requests cannot both reserve the same remaining balance.
- Rectification replaces its original allocation without counting both documents. Issued invoices remain counted when moved to the trash; restoring drafts checks capacity.
- Imported-invoice insert/update and final issuance use database triggers. Issued credit notes release capacity; unfinished credits do not.
- The editor previews available capacity and disables saving/finalizing an over-limit document. The server remains authoritative when another session changes the balance. The legacy editor retains its form on refusal and only announces success after server persistence.
- An unknown order amount cannot provide a ceiling. Historical balances remain marked provisional until reconciliation is complete.

## Validation

TypeScript and production build; 12 API/domain scenarios covering concurrent allocations, edits, restoration, legacy imports, rectification, final issuance, existing quote conversion and immutable archives. Browser verification covers blocked save/finalize, exact remaining capacity, legacy save refusal, light/dark themes and mobile layouts. Full quote-to-invoice/report flow also checked with the existing PDF service fixture.

Deployment: apply the additive `billingOrderBudgetSchema` before publishing the Worker. Preserve existing Worker bindings and settings. Publish static assets together with cache tag `engagement-control-20261024`. No PDF engine or hosting plan changes are required.
