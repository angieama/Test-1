"""Exercise the application's real claim SQL against its actual migration."""
import concurrent.futures
import pathlib
import re
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLAIM_SQL = re.search(r'CLAIM_QUERY = `([\s\S]+?)`', (ROOT / 'lib/ride-queries.ts').read_text()).group(1)
NOW = 1800000000000
WINDOW = 30 * 60 * 1000

class ClaimIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(pathlib.Path(self.temp.name) / 'payments.sqlite')
        with sqlite3.connect(self.path) as db:
            for migration in sorted((ROOT / 'drizzle').glob('*.sql')):
                db.executescript(migration.read_text())

    def tearDown(self):
        self.temp.cleanup()

    def payment(self, receipt, received_at):
        with sqlite3.connect(self.path) as db:
            db.execute('INSERT INTO payments (receipt,name,phone,amount,received_at) VALUES (?,?,?,?,?)', (receipt, 'Sample Customer', '0712 ••• 482', 10000, received_at))

    def claim(self, reference, receipt='DEMO000001'):
        with sqlite3.connect(self.path, timeout=10) as db:
            return db.execute(CLAIM_SQL, (NOW, reference, None, receipt, NOW-WINDOW, NOW, None, None)).fetchone()

    def test_simultaneous_claims_have_exactly_one_winner(self):
        self.payment('DEMO000001', NOW-1000)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(self.claim, ['Seat 4', 'Seat 8']))
        self.assertEqual(sum(result is not None for result in results), 1)
        with sqlite3.connect(self.path) as db:
            winner = db.execute('SELECT claimed_for,claimed_at FROM payments').fetchone()
        self.assertIn(winner[0], ['Seat 4', 'Seat 8'])
        self.assertEqual(winner[1], NOW)
        self.assertIsNone(self.claim('Replacement customer'))
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT claimed_for,claimed_at FROM payments').fetchone(), winner)

    def test_expired_and_future_receipts_cannot_be_claimed(self):
        self.payment('DEMOOLD', NOW-WINDOW-1)
        self.payment('DEMOFUTURE', NOW+1)
        self.assertIsNone(self.claim('Customer', 'DEMOOLD'))
        self.assertIsNone(self.claim('Customer', 'DEMOFUTURE'))

    def test_window_boundary_and_saved_reference_survive_new_connections(self):
        self.payment('DEMO000001', NOW-WINDOW)
        self.assertIsNotNone(self.claim('Customer / Order 7'))
        self.assertIsNone(self.claim('Customer 2'))
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT claimed_for FROM payments').fetchone()[0], 'Customer / Order 7')

    def test_duplicate_receipt_is_rejected(self):
        self.payment('DEMO000001', NOW)
        with self.assertRaises(sqlite3.IntegrityError):
            self.payment('DEMO000001', NOW)

if __name__ == '__main__':
    unittest.main()
