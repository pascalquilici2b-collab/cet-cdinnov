# Calendar leave periods

`leave-periods.mjs` derives continuous display periods from half-day records or legacy date ranges. It never writes requests, approvals or balances. Adjacent compatible absences can cross a weekend; a missing working half-day, different status/type/person or intervening absence keeps periods separate. The existing paid-leave Saturday convention is retained.

The portal calendar clips these periods at week and month boundaries, just like trips. Clicking a period shows its recorded days and opens the existing day management dialog.

Build the embedded browser helper with `node agenda/install.mjs`. It needs `esbuild`; `MARCHES_BUILD_PACKAGE` can point to a package.json whose node_modules contains it. Run this after changes to the helper. Run `node marches/install.mjs` after changes to the market UI. Both installers must be idempotent and retain the shared billing navigation.

Run `node --test agenda/leave-periods.test.mjs` for the grouping rules. For the full navigation/calendar/Smartsheet UI regression, set `PORTAL_QA` to a private screenshot output directory and run `node agenda/browser-test.mjs`; `PLAYWRIGHT_PACKAGE` may point to the Playwright package.json. It uses Edge and an ephemeral loopback server with synthetic data and blocked external requests. Its fixture boot is injected only into the local response, never into published files.
