CREATE TABLE `cash_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`ride_id` text NOT NULL,
	`amount` integer NOT NULL,
	`passenger_count` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_ride_created_idx` ON `cash_payments` (`ride_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rides` (
	`id` text PRIMARY KEY NOT NULL,
	`route` text NOT NULL,
	`fare` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`active_slot` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rides_active_slot_idx` ON `rides` (`active_slot`);--> statement-breakpoint
CREATE INDEX `rides_started_idx` ON `rides` (`started_at`);--> statement-breakpoint
ALTER TABLE `payments` ADD `ride_id` text REFERENCES rides(id);--> statement-breakpoint
CREATE INDEX `payments_ride_idx` ON `payments` (`ride_id`);