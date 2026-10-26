"""Exercise the actual atomic journey completion and earnings SQL."""
import concurrent.futures, json, re, sqlite3, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'lib/payments-server.ts').read_text()
close_sql=re.search(r'prepare\(`(UPDATE journeys SET ended_at.*?)`\)',source,re.S)[1]
queries=re.findall(r'prepare\(`(.*?)`\)',source.split('export async function earningsReport')[1],re.S)
totals_sql,rides_sql=queries[:2]
now=1800000000000
with tempfile.TemporaryDirectory() as directory:
 path=Path(directory)/'cash.sqlite'
 with sqlite3.connect(path) as db:
  for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:
   db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
  for ident,owner in [('ride','owner'),('zero','other'),('cash-only','cash-owner')]:
   db.execute("INSERT INTO journeys (id,owner_id,origin,destination,fare_cents,started_at) VALUES (?,?,'Nairobi','Town',10000,?)",(ident,owner,now-86400000))
  db.execute("INSERT INTO payments (id,owner_id,receipt,customer,amount_cents,received_at,journey_id,fare_cents) VALUES ('one','owner','ONE','Brian',20000,?,'ride',10000)",(now-1000,))
  db.commit()
 def close(owner='owner',ident='ride',cash=50000):
  with sqlite3.connect(path,timeout=10) as db:
   rows=db.execute(close_sql,(now,cash,ident,owner)).fetchall();db.commit();return len(rows)
 assert close('other')==0
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  assert sum(pool.map(lambda _:close(),range(8)))==1
 assert close()==0
 assert close('other','zero',0)==1
 assert close('cash-owner','cash-only',7000)==1
 def totals(owner,start,end):
  with sqlite3.connect(path) as db:
   db.row_factory=sqlite3.Row
   return dict(db.execute(totals_sql,(owner,start,end)*3).fetchone())
 report=totals('owner',now-2000,now+1)
 assert report['receivedCents']==70000 and report['cashCents']==50000 and report['netCents']==70000 and report['receipts']==1
 # Receipt and closing cash fall on independently selected dates.
 report=totals('owner',now,now+1)
 assert report['receivedCents']==50000 and report['cashCents']==50000 and report['receipts']==0
 assert totals('owner',now-2000,now)['cashCents']==0
 assert totals('cash-owner',now,now+1)['netCents']==7000
 with sqlite3.connect(path) as db:
  db.row_factory=sqlite3.Row
  rides=[dict(r) for r in db.execute(rides_sql,('owner',now,now+1)*3+('owner',))]
  assert len(rides)==1 and rides[0]['netCents']==50000 and rides[0]['cashCents']==50000
  assert db.execute('SELECT COUNT(*) FROM claims').fetchone()[0]==0
  try:
   db.execute("UPDATE journeys SET cash_cents=1 WHERE id='ride'")
   raise AssertionError('Completed cash must be final')
  except sqlite3.IntegrityError:db.rollback()
print('PASS: optional zero cash, owner isolation, one concurrent closing winner, no duplicate cash, cash-only rides, cash in earnings/rankings by close date, immutable completed cash, no synthetic receipts/passenger claims')
