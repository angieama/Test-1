CREATE TABLE `claims` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`seeded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`receipt` text NOT NULL,
	`customer` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_unique` ON `payments` (`receipt`);--> statement-breakpoint
CREATE INDEX `payments_owner_received` ON `payments` (`owner_id`,`received_at`);
--> statement-breakpoint
CREATE TRIGGER claims_cannot_be_updated
BEFORE UPDATE ON claims BEGIN
  SELECT RAISE(ABORT, 'Verified receipts are permanently locked');
END;
--> statement-breakpoint
CREATE TRIGGER claims_cannot_be_deleted
BEFORE DELETE ON claims BEGIN
  SELECT RAISE(ABORT, 'Verified receipts are permanently locked');
END;
