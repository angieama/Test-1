export const RIDE_SUMMARY_QUERY = `SELECT r.*,
 (SELECT COALESCE(SUM(amount),0) FROM payments WHERE ride_id=r.id AND claimed_at IS NOT NULL) AS mpesa_total,
 (SELECT COUNT(*) FROM payments WHERE ride_id=r.id AND claimed_at IS NOT NULL) AS mpesa_count,
 (SELECT COALESCE(SUM(amount),0) FROM cash_payments WHERE ride_id=r.id) AS cash_total,
 (SELECT COALESCE(SUM(passenger_count),0) FROM cash_payments WHERE ride_id=r.id) AS cash_passengers,
 (SELECT COUNT(*) FROM cash_payments WHERE ride_id=r.id) AS cash_count
FROM rides r ORDER BY r.started_at DESC,r.id DESC LIMIT ? OFFSET ?`;
export const RIDE_ENTRIES_QUERY = `SELECT receipt AS id,'mpesa' AS kind,amount,claimed_at AS occurred_at,name AS customer,claimed_for AS reference,NULL AS passengers FROM payments WHERE ride_id=? AND claimed_at IS NOT NULL
UNION ALL
SELECT id,'cash' AS kind,amount,created_at AS occurred_at,NULL AS customer,note AS reference,passenger_count AS passengers FROM cash_payments WHERE ride_id=?
ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?`;
export const START_RIDE_QUERY = `INSERT INTO rides (id,route,fare,started_at,active_slot)
SELECT ?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM rides WHERE active_slot=1)
ON CONFLICT(id) DO NOTHING RETURNING *`;
export const END_RIDE_QUERY = `UPDATE rides SET ended_at=?,active_slot=NULL WHERE id=? AND active_slot=1 RETURNING *`;
export const CASH_QUERY = `INSERT INTO cash_payments (id,ride_id,amount,passenger_count,note,created_at)
SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rides WHERE id=? AND active_slot=1)
ON CONFLICT(id) DO NOTHING RETURNING *`;
export const CLAIM_QUERY = `UPDATE payments SET claimed_at=?,claimed_for=?,ride_id=?
WHERE receipt=? AND claimed_at IS NULL AND received_at>=? AND received_at<=?
AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM rides WHERE active_slot=1)) OR EXISTS(SELECT 1 FROM rides WHERE id=? AND active_slot=1))
RETURNING *`;
