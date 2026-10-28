"""Exercise shipped server analysis queries with another merchant in the same database."""
import json,re,sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'lib/payments-server.ts').read_text().split('export async function analysisReport')[1]
queries=re.findall(r'prepare\(`(.*?)`\)',source,re.S)
assert len(queries)==3
with sqlite3.connect(':memory:') as db:
 for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
 db.row_factory=sqlite3.Row
 for who in ['owner','other']:
  db.execute("INSERT INTO journeys (id,owner_id,origin,destination,fare_cents,started_at) VALUES (?,?,'Kileleshwa','Town',10000,100)",(who,who))
  db.execute("INSERT INTO payments (id,owner_id,receipt,customer,amount_cents,received_at,journey_id,fare_cents) VALUES (?,?,?,'Demo',10000,200,?,10000)",(who,who,who,who))
  db.execute("INSERT INTO claims (payment_id,customer,verified_at,passengers) VALUES (?,'Demo',300,1)",(who,))
  db.execute("INSERT INTO refunds VALUES (?,?,1000,400)",(who,who))
 results=[[dict(r) for r in db.execute(q,('owner',))] for q in queries]
 assert len(results[0])==len(results[1])==len(results[2])==1
 assert results[0][0]['id']=='owner' and results[0][0]['refundedCents']==1000
 assert results[0][0]['passengers']==1
 assert results[1][0]['journeyId']==results[2][0]['id']=='owner'
 assert all('customer' not in row and 'receipt' not in row for batch in results for row in batch)
 assert all(not list(db.execute(q,('unknown',))) for q in queries)
print('PASS: server analysis is owner-scoped across payments, claims, refunds and journeys; no payer names or receipt codes are selected')
