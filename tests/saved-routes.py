"""Verify owner isolation and non-destructive route templates using shipped SQL."""
import json,re,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'lib/payments-server.ts').read_text()
queries=re.findall(r'prepare\(`(.*?)`\)',source.split('export async function listSavedRoutes')[1],re.S)
list_sql,update_sql,insert_sql=queries[:3]
with sqlite3.connect(':memory:') as db:
 for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:
  db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
 db.execute(insert_sql,('route','owner','Nairobi','Town',10000,1000,1000))
 assert len(db.execute(list_sql,('owner',)).fetchall())==1
 assert not db.execute(list_sql,('other',)).fetchall()
 assert not db.execute(update_sql,('A','B',20000,2000,'route','other')).fetchall()
 assert db.execute(update_sql,('Nairobi','Westlands',15000,2000,'route','owner')).fetchone()[0]=='route'
 assert db.execute('SELECT COUNT(*) FROM journeys').fetchone()[0]==0
 assert db.execute('SELECT COUNT(*) FROM payments').fetchone()[0]==0
print('PASS: saved-route SQL is owner-scoped and does not create/modify journeys or payments')
