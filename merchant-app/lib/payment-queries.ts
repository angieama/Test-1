// Disjoint ranges retain every receipt once and use the recent + confirmed indexes.
export const PAYMENT_QUERY = `SELECT * FROM payments WHERE received_at >= ?
UNION ALL
SELECT * FROM payments WHERE received_at < ? AND claimed_at IS NOT NULL
ORDER BY received_at DESC LIMIT 500`;
export const SUMMARY_QUERY = `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS received,
COALESCE(SUM(CASE WHEN claimed_at IS NOT NULL THEN 1 ELSE 0 END),0) AS confirmed
FROM payments WHERE received_at >= ?`;
