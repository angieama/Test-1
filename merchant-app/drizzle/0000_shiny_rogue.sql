CREATE TABLE `demo_state` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`receipt` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`amount` integer NOT NULL,
	`received_at` integer NOT NULL,
	`claimed_at` integer,
	`claimed_for` text
);
--> statement-breakpoint
CREATE INDEX `payments_received_idx` ON `payments` (`received_at`);