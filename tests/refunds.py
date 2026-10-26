"""Production refund SQL: ownership, caps, concurrent attempts, idempotency and locks."""
import concurrent.futures, json, re, sqlite3, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'lib/payments-server.ts').read_text()
query=re.search(r'prepare\(`(INSERT INTO refunds .*?)`\)',source,re.S)[1]
claim=re.search(r'prepare\(`(INSERT INTO claims .*?)`\)',source.split('export async function claimPayment')[1],re.S)[1]
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'refunds.sqlite'
    with sqlite3.connect(path) as db:
        for entry in json.loads((root/'drizzle/meta/_journal.json').read_text())['entries']:
            db.executescript((root/'drizzle'/(entry['tag']+'.sql')).read_text())
        for ident in ['receipt','retry','unverified']:
            db.execute("INSERT INTO payments (id,owner_id,receipt,customer,amount_cents,received_at) VALUES (?,'owner',?,'Brian',10000,1000)",(ident,ident))
        db.execute("INSERT INTO claims VALUES ('receipt','Brian','',1100,1,10000)")
        db.commit()
    def refund(ident,amount=3000,receipt='receipt',owner='owner'):
        with sqlite3.connect(path,timeout=10) as db:
            result=db.execute(query,(ident,amount,1200,receipt,owner,amount)).fetchall()
            db.commit()
            return len(result)
    assert refund('foreign',owner='other')==0
    assert refund('over',10001)==0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda n:refund('race'+str(n)),range(8)))
    assert sum(results)==3,results
    assert refund('remaining',1000)==1
    assert refund('excess',1)==0
    assert refund('same',2000,'retry')==1
    assert refund('same',2000,'retry')==0
    assert refund('partial',1000,'unverified')==1
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT SUM(amount_cents) FROM refunds WHERE payment_id='receipt'").fetchone()[0]==10000
        assert db.execute("SELECT COUNT(*) FROM refunds WHERE id='same'").fetchone()[0]==1
        assert db.execute("SELECT COUNT(*) FROM claims WHERE payment_id='receipt'").fetchone()[0]==1
        assert not db.execute(claim,('Brian',1300,1,10000,'unverified','owner',0,2000,10000,10000,1)).fetchall()
        for sql in ["DELETE FROM refunds", "UPDATE refunds SET amount_cents=1", "INSERT INTO refunds VALUES ('zero','retry',0,1200)"]:
            try:
                db.execute(sql)
                raise AssertionError('Refund ledger must reject mutation or invalid money')
            except sqlite3.IntegrityError:
                db.rollback()
print('PASS: full/partial refunds, ownership, concurrent cap, duplicate requests, immutable ledger and refunded-receipt verification guard')
