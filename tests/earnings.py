"""Test production earnings SQL against ledger fixtures, including split receipts."""
import json, re, sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'lib/payments-server.ts').read_text().split('export async function earningsReport')[1]
queries=re.findall(r'prepare\(`(.*?)`\)',source,re.S)
totals_sql,rides_sql=queries[:2]
start,end=1800000000000,1800000000000+86400000
with sqlite3.connect(':memory:') as db:
    for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:
        db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
    db.row_factory=sqlite3.Row
    for ident,who in [('a','owner'),('b','owner'),('private','other')]:
        db.execute("INSERT INTO journeys (id,owner_id,origin,destination,fare_cents,started_at,ended_at) VALUES (?,?,?,'Town',10000,?,?)",(ident,who,ident,start-86400000,start+10000))
    fixtures=[('first','owner',8000,start,'a'),('topup','owner',2000,start+1,'a'),('big','owner',50000,start+500,'b'),('unassigned','owner',3000,start+1,None),('old','owner',90000,start-1,'b'),('boundary','owner',90000,end,'b'),('foreign','other',990000,start,'private')]
    for ident,who,amount,received,ride in fixtures:
        db.execute("INSERT INTO payments VALUES (?,?,?,'Brian',?,?,?,10000)",(ident,who,ident,amount,received,ride))
    for ident,people in [('first',1),('topup',0)]:
        db.execute("INSERT INTO claims VALUES (?,'Brian','combine:first',?, ?,10000)",(ident,start+2,people))
    db.execute("INSERT INTO refunds VALUES ('refund-big','big',45000,?)",(start+1000,))
    db.execute("INSERT INTO refunds VALUES ('refund-old','old',1000,?)",(start+1000,))
    db.execute("INSERT INTO refunds VALUES ('refund-unassigned','unassigned',1000,?)",(start+1000,))
    totals=dict(db.execute(totals_sql,('owner',start,end,'owner',start,end,'owner',start,end)).fetchone())
    assert totals==dict(receivedCents=63000,cashCents=0,refundedCents=47000,netCents=16000,confirmedCents=10000,unverifiedCents=53000,unassignedCents=3000,receipts=4,rideCount=2),totals
    rides=[dict(r) for r in db.execute(rides_sql,('owner',start,end,'owner',start,end,'owner',start,end,'owner'))]
    assert [r['id'] for r in rides]==['a','b']
    assert rides[0]['receivedCents']==10000 and rides[0]['confirmedCents']==10000 and rides[0]['receipts']==2
    assert rides[1]['refundedCents']==46000 and rides[1]['netCents']==4000
    empty=dict(db.execute(totals_sql,('nobody',start,end,'nobody',start,end,'nobody',start,end)).fetchone())
    assert all(value==0 for value in empty.values())
print('PASS: complete historical totals, owner isolation, inclusive/exclusive date bounds, unassigned payments, split receipts counted once, ride revenue ranking and zero-data reports')
