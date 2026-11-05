/** Link a frozen RH version to its live private stamping batch. */
export const rhStampingSchema=[
 `CREATE TABLE IF NOT EXISTS rh_stamp_links(version_id TEXT NOT NULL,owner TEXT NOT NULL,batch_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(version_id,owner))`,
 `CREATE INDEX IF NOT EXISTS rh_stamp_links_batch ON rh_stamp_links(batch_id)`
];
