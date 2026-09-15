import sqlite3
import json

conn = sqlite3.connect('db/custom.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'")
tables = [r[0] for r in cur.fetchall()]

data = {}
for t in tables:
    cur.execute(f'SELECT * FROM "{t}"')
    rows = [dict(r) for r in cur.fetchall()]
    data[t] = rows
    print(f"{t}: {len(rows)} rows")

with open('db/sqlite-export.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print("Export completed to db/sqlite-export.json")
