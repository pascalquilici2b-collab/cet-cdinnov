"""Restore a private D1 SQL export into an in-memory SQLite database and compare every table."""
import sqlite3, json, sys, pathlib, hashlib, time

folder = pathlib.Path(sys.argv[1]).resolve()
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.executescript((folder / 'database.sql').read_text(encoding='utf-8'))
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
canonical = lambda rows: sorted(json.dumps(dict(row), sort_keys=True, ensure_ascii=False) for row in rows)
for table in manifest['tables']:
    assert table['name'].replace('_', '').isalnum()
    expected = json.loads((folder / ('table-' + table['name'] + '.json')).read_text(encoding='utf-8'))
    actual = db.execute('SELECT * FROM "' + table['name'] + '"').fetchall()
    assert canonical(actual) == canonical(expected), 'Mismatch in ' + table['name']
before = dict(db.execute("SELECT * FROM budgets_workspace WHERE id='shared'").fetchone())
source = json.loads(before['payload'])
sql = (pathlib.Path(__file__).parent / 'migrations' / '0001-budget-records.sql').read_text(encoding='utf-8')
db.executescript(sql)
db.executescript(sql)
assert dict(db.execute("SELECT * FROM budgets_workspace WHERE id='shared'").fetchone()) == before
counts = {}
for collection in ['clients','projects','budgetLines','expenses','drs','imports','partnerReports']:
    actual = [json.loads(row['payload']) for row in db.execute('SELECT payload FROM app_budget_records WHERE collection=? ORDER BY position', (collection,))]
    assert actual == source.get(collection, []), collection
    counts[collection] = len(actual)
db.execute("UPDATE budgets_workspace SET payload=payload WHERE id='shared'")
assert dict(db.execute("SELECT * FROM budgets_workspace WHERE id='shared'").fetchone()) == before
plan = [tuple(r) for r in db.execute("EXPLAIN QUERY PLAN SELECT record_id,name FROM app_budget_records WHERE workspace_id='shared' AND collection='clients' ORDER BY position")]
assert any('INDEX' in str(r) for r in plan)
result = {'restoredTables':len(manifest['tables']), 'integrity':'ok', 'dataUnchanged':True,'repeatableMigration':True,'projectedRecords':counts,'indexedQuery':True}
(folder / 'restore-verification.json').write_text(json.dumps(result, indent=2),encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
