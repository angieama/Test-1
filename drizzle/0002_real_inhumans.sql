CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`refunded_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `refunds_date` ON `refunds` (`refunded_at`);--> statement-breakpoint
CREATE TRIGGER refunds_are_permanent_update BEFORE UPDATE ON refunds BEGIN
 SELECT RAISE(ABORT, 'Refund records cannot be changed');
END;
--> statement-breakpoint
CREATE TRIGGER refunds_are_permanent_delete BEFORE DELETE ON refunds BEGIN
 SELECT RAISE(ABORT, 'Refund records cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER refunds_amount_guard BEFORE INSERT ON refunds
WHEN NEW.amount_cents <= 0 OR NEW.amount_cents > COALESCE((SELECT amount_cents FROM payments WHERE id = NEW.payment_id),0) - COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE payment_id = NEW.payment_id),0)
BEGIN SELECT RAISE(ABORT, 'Refund exceeds the remaining payment'); END;
