"""Exercise the production atomic combined-claim SQL, including concurrent claims."""
import concurrent.futures
import json
import re
import sqlite3
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = (root / 'lib/payments-server.ts').read_text()
query = re.search(r'prepare\(`(WITH eligible AS MATERIALIZED .*?)`\)', source, re.S)[1]
now = 1800000000000
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'combine.sqlite'
    with sqlite3.connect(path) as db:
        for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:
            db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
        db.execute("INSERT INTO journeys (id,owner_id,origin,destination,fare_cents,started_at,ended_at) VALUES ('ride','owner','Nairobi','Town',10000,?,NULL)", (now-10000,))
        for ident, amount, owner, received in [('a',8000,'owner',now-1000),('b',2000,'owner',now-1000),('c',2000,'owner',now-1000),('short',1000,'owner',now-1000),('expired',2000,'owner',now-1800000),('foreign',2000,'other',now-1000)]:
            db.execute("INSERT INTO payments VALUES (?,?,?,'Brian',?,?,'ride',10000)", (ident,owner,ident,amount,received))
        db.commit()
    def combine(a,b,passengers=1):
        with sqlite3.connect(path,timeout=10) as db:
            result=db.execute(query,(a,b,'owner',now-1800000,now,'Brian','combine:'+a,now,a,passengers,10000)).fetchall()
            db.commit()
            return len(result)
    assert combine('a','expired') == 0
    assert combine('a','foreign') == 0
    assert combine('a','a') == 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda i: combine('a', 'b' if i%2 else 'c'), range(8)))
    assert sum(results) == 2, results
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT COUNT(*),SUM(passengers) FROM claims').fetchone() == (2,1)
        assert db.execute('SELECT SUM(p.amount_cents) FROM claims c JOIN payments p ON p.id=c.payment_id').fetchone()[0] == 10000
        assert db.execute("SELECT COUNT(*) FROM claims WHERE payment_id='a'").fetchone()[0] == 1
        # Existing permanent-lock triggers also protect grouped receipts.
        try:
            db.execute("DELETE FROM claims WHERE payment_id='a'")
            raise AssertionError('combined receipt lock deleted')
        except sqlite3.IntegrityError:
            db.rollback()
    assert combine('a','short') == 0
print('PASS: 80 + 20 = one passenger, both receipts lock atomically, expired/foreign/duplicate receipts rejected, overlapping concurrent requests cannot partially claim or double-count')
