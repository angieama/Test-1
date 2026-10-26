ALTER TABLE `journeys` ADD `cash_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER journey_cash_is_final BEFORE UPDATE OF cash_cents ON journeys
WHEN OLD.ended_at IS NOT NULL OR NEW.cash_cents < 0 OR NEW.cash_cents > 25000000 OR (NEW.cash_cents > 0 AND NEW.ended_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Cash is saved once when the journey ends'); END;
