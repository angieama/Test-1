"""End-to-end API checks against a running local preview, using isolated demo owners.

Run: python tests/integration.py [http://127.0.0.1:4173]
Uses only Python's standard library. Never run against a real merchant account.
"""
import concurrent.futures
import json
import sqlite3
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
assert BASE.startswith(("http://127.0.0.1:", "http://localhost:", "http://terminal.local:")), "Tests require a local preview."
OWNER = "qa-" + uuid.uuid4().hex


def call(path="/api/payments", body=None, owner=OWNER, origin=None):
    headers = {"oai-authenticated-user-id": owner, "oai-authenticated-user-email": "qa@sites.test"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if origin:
        headers["Origin"] = origin
    data = json.dumps(body).encode() if body is not None else None
    request = Request(BASE + path, data=data, headers=headers)
    try:
        response = build_opener(ProxyHandler({})).open(request, timeout=20)
    except HTTPError as error:
        response = error
    return response.status, json.loads(response.read())


status, data = call()
assert status == 200, (status, data)
initial = data["payments"]
assert len(initial) == 19, len(initial)
assert sum(p["verifiedAt"] is not None for p in initial) == 6
assert all(p["verifiedAt"] or p["receivedAt"] > data["serverTime"] - 1800000 for p in initial)
assert {p["id"] for p in call()[1]["payments"]} == {p["id"] for p in initial}, "Seeding must run once."
print("PASS: once-only seeding, rolling results, and historical confirmations")

for amount in ["0", "-1", "1.234", "250000.01", "1e2", "NaN"]:
    assert call(body={"customer": "QA", "amount": amount})[0] == 400, amount
assert call(body={"customer": " ", "amount": "100"})[0] == 400
assert call(body=[])[0] == 400
assert call(body={"customer": "QA", "amount": "100"}, origin="https://untrusted.invalid")[0] == 403
assert len(call()[1]["payments"]) == len(initial)
print("PASS: input validation and cross-origin rejection")

status, added = call(body={"customer": "QA customer", "amount": "500.05"})
assert status == 201, (status, added)
payment_id = added["id"]
payment = next(p for p in call()[1]["payments"] if p["id"] == payment_id)
assert payment["amountCents"] == 50005 and payment["verifiedAt"] is None
path = f"/api/payments/{payment_id}/verify"
assert call(path, {"customer": "Intruder"}, owner=OWNER + "-other")[0] == 404
assert call(owner=OWNER + "-other")[0] == 200
assert payment_id not in {p["id"] for p in call(owner=OWNER + "-other")[1]["payments"]}
print("PASS: exact cents and merchant data isolation")

def claim(index):
    return call(path, {"passengers": 2, "fare": "250"})[0]

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    statuses = list(executor.map(claim, range(6)))
assert statuses.count(200) == 1 and statuses.count(409) == 5, statuses
saved = next(p for p in call()[1]["payments"] if p["id"] == payment_id)
assert saved["claimedCustomer"] == "QA" and saved["passengers"] == 2 and saved["reference"] == ""
assert call(path, {"customer": "Replacement"})[0] == 409
reloaded = next(p for p in call()[1]["payments"] if p["id"] == payment_id)
assert saved == reloaded
print("PASS: one winning claim under concurrency, duplicate rejection, durable customer lock")

# Inspect only this run's disposable local test fixtures. No record is deleted.
db_path = next(p for p in Path(".wrangler/state/v3/d1").rglob("*.sqlite") if p.name != "metadata.sqlite")
with sqlite3.connect(db_path) as db:
    expired = db.execute("SELECT id FROM payments WHERE owner_id = ? AND customer = 'Sarah'", (OWNER,)).fetchone()[0]
    assert call(f"/api/payments/{expired}/verify", {"customer": "Too late"})[0] == 410
    for statement, params in [
        ("UPDATE claims SET customer = 'Changed' WHERE payment_id = ?", (payment_id,)),
        ("DELETE FROM claims WHERE payment_id = ?", (payment_id,)),
    ]:
        try:
            db.execute(statement, params)
            raise AssertionError("The database must reject changes to locked receipts.")
        except sqlite3.IntegrityError as error:
            assert "permanently locked" in str(error)
        finally:
            db.rollback()
print("PASS: expired payment rejection and immutable database claims")
print("All payment integrity checks passed.")
