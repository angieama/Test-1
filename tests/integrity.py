"""Exercise the shipped SQL with upgraded SQLite ledgers and concurrent claims."""
import concurrent.futures
import json
import re
import sqlite3
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / "lib/payments-server.ts").read_text()
qr_source = (root / "app/api/journeys/[id]/qr/route.ts").read_text()
tick = chr(96)

def query_starting(text, prefix, selector=None):
    queries = re.findall(r"prepare\(" + tick + "(.*?)" + tick + r"\)", text, re.S)
    return next(q for q in queries if q.startswith(prefix) and (not selector or selector in q))

claim_sql = query_starting(source, "INSERT INTO claims", "SELECT id,")
start_sql = query_starting(source, "INSERT INTO journeys")
add_sql = query_starting(source, "INSERT INTO payments", "SELECT ?, ?, ?, ?, ?, ?, id")
totals_sql = query_starting(source, "SELECT j.id")
qr_sql = query_starting(qr_source, "INSERT INTO fare_requests")
now, window = 1800000000000, 1800000

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "ledger.sqlite"
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        entries = json.loads((root / "drizzle/meta/_journal.json").read_text())["entries"]
        db.executescript((root / "drizzle" / (entries[0]["tag"] + ".sql")).read_text())
        db.execute("INSERT INTO payments VALUES ('legacy','merchant-a','LEGACY','Legacy Name',10000,?)", (now-1000,))
        db.execute("INSERT INTO claims VALUES ('legacy','Legacy Name','',?)", (now-500,))
        db.commit()
        for entry in entries[1:]:
            db.executescript((root / "drizzle" / (entry["tag"] + ".sql")).read_text())
        assert db.execute("SELECT passengers, fare_cents FROM claims WHERE payment_id='legacy'").fetchone() == (1, None)
        assert db.execute("SELECT journey_id FROM payments WHERE id='legacy'").fetchone()[0] is None
        db.commit()
    print("PASS: existing receipt locks survive schema upgrade and remain unassigned")

    def start(owner, journey_id):
        with sqlite3.connect(path, timeout=10) as db:
            rows = db.execute(start_sql, (journey_id, owner, "Nairobi", "Town", 10000, now-10000, owner)).fetchall()
            db.commit()
            return len(rows)
    assert start("merchant-a", "ride-a") == 1
    assert start("merchant-a", "extra-ride") == 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        winners = list(pool.map(lambda n: start("merchant-b", "race-ride-" + str(n)), range(6)))
    assert sum(winners) == 1, winners
    print("PASS: only one active journey per merchant, including concurrent starts")

    fixtures = [
        ("recent", now-1000, 10000), ("boundary", now-window, 10000),
        ("inside", now-window+1, 10000), ("expired", now-window-1, 10000),
        ("future", now+1, 10000), ("race", now-1000, 20000),
        ("two", now-1000, 20000), ("underpaid", now-1000, 5000),
        ("one-and-half", now-1000, 15000), ("extra", now-1000, 25000),
    ]
    with sqlite3.connect(path) as db:
        for payment_id, received, cents in fixtures:
            db.execute("INSERT INTO payments (id,owner_id,receipt,customer,amount_cents,received_at,journey_id,fare_cents) VALUES (?,'merchant-a',?,'Brian',?,?,'ride-a',10000)", (payment_id, payment_id, cents, received))
        db.commit()

    def claim(payment_id, owner="merchant-a", customer="Brian", passengers=1, fare=10000):
        with sqlite3.connect(path, timeout=10) as db:
            rows = db.execute(claim_sql, (customer, now, passengers, fare, payment_id, owner, now-window, now, fare, fare, passengers)).fetchall()
            db.commit()
            return len(rows)
    assert claim("recent", owner="merchant-b") == 0
    for payment_id in ["boundary", "expired", "future", "missing", "underpaid"]:
        assert claim(payment_id) == 0, payment_id
    assert claim("inside") == 1
    assert claim("recent") == 1
    assert claim("recent", customer="Replacement") == 0
    assert claim("one-and-half", passengers=2) == 0
    assert claim("two", passengers=2) == 1
    assert claim("extra", passengers=2) == 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda n: claim("race", customer="Customer "+str(n), passengers=2), range(8)))
    assert sum(results) == 1, results
    with sqlite3.connect(path) as db:
        db.row_factory = sqlite3.Row
        totals = dict(db.execute(totals_sql, ("merchant-a",)).fetchone())
        assert totals["passengerCount"] == 8, totals
        assert totals["verifiedCount"] == 5, totals
        assert totals["paymentCount"] == len(fixtures), totals
        assert totals["confirmedCents"] == 85000, totals
    print("PASS: expiry, ownership, underpayment rejection, two-person receipts and exactly one winning claim")
    print("PASS: journey totals count 8 passengers from 5 receipts, without double-counting money")

    with sqlite3.connect(path) as db:
        db.execute("UPDATE journeys SET fare_cents=15000 WHERE id='ride-a'")
        db.execute(add_sql, ("new-fare", "merchant-a", "NEWFARE", "Mercy", 30000, now, "ride-a", "merchant-a"))
        qr = db.execute(qr_sql, ("qr-a", "merchant-a", 2, 2, now, "ride-a", "merchant-a", 2)).fetchone()
        assert qr == (15000, 30000), qr
        assert db.execute("SELECT fare_cents FROM payments WHERE id='two'").fetchone()[0] == 10000
        assert db.execute("SELECT fare_cents FROM payments WHERE id='new-fare'").fetchone()[0] == 15000
        assert db.execute("SELECT passengers,fare_cents FROM claims WHERE payment_id='two'").fetchone() == (2, 10000)
        db.execute("UPDATE journeys SET ended_at=? WHERE id=? AND owner_id=? AND ended_at IS NULL", (now+1, "ride-a", "merchant-a"))
        assert db.execute(add_sql, ("too-late", "merchant-a", "LATE", "Late", 10000, now+2, "ride-a", "merchant-a")).fetchall() == []
        assert db.execute(qr_sql, ("qr-ended", "merchant-a", 2, 2, now+2, "ride-a", "merchant-a", 2)).fetchall() == []
        db.commit()
    assert start("merchant-a", "ride-next") == 1
    with sqlite3.connect(path) as db:
        for sql in [
            "UPDATE claims SET passengers=1 WHERE payment_id='two'",
            "DELETE FROM claims WHERE payment_id='two'",
            "UPDATE payments SET journey_id='ride-next' WHERE id='two'",
            "UPDATE payments SET fare_cents=20000 WHERE id='two'",
        ]:
            try:
                db.execute(sql)
                raise AssertionError("A locked receipt must keep its passengers, fare and journey.")
            except sqlite3.IntegrityError:
                pass
            finally:
                db.rollback()
        assert db.execute("SELECT journey_id FROM payments WHERE id='two'").fetchone()[0] == "ride-a"
        assert db.execute("SELECT count(*) FROM payments WHERE journey_id='ride-next'").fetchone()[0] == 0
    print("PASS: fare/QR snapshots, ended-ride protections, and immutable ride/payment association")

    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO payments (id,owner_id,receipt,customer,amount_cents,received_at,journey_id,fare_cents) VALUES ('ten','merchant-a','TEN','Brian',100000,?,'ride-a',10000)", (now-1000,))
        db.commit()
    assert claim("ten", passengers=10) == 1
    assert claim("ten", passengers=10) == 0
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT passengers FROM claims WHERE payment_id='ten'").fetchone()[0] == 10
    print("PASS: ten-passenger group is persisted once and cannot be claimed again")

print("All journey and receipt integrity checks passed.")
