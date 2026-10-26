CREATE TABLE `fare_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`journey_id` text NOT NULL,
	`fare_cents` integer NOT NULL,
	`passengers` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`fare_cents` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `journeys_owner_started` ON `journeys` (`owner_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_journey_per_owner` ON `journeys` (`owner_id`) WHERE "journeys"."ended_at" IS NULL;--> statement-breakpoint
ALTER TABLE `claims` ADD `passengers` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `claims` ADD `fare_cents` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `journey_id` text REFERENCES journeys(id);--> statement-breakpoint
ALTER TABLE `payments` ADD `fare_cents` integer;
--> statement-breakpoint
CREATE TRIGGER payment_journey_is_permanent
BEFORE UPDATE OF journey_id, fare_cents ON payments BEGIN
  SELECT RAISE(ABORT, 'A payment keeps its original journey and fare');
END;
