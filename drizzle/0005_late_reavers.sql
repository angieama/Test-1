CREATE TABLE `saved_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`fare_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_routes_owner_updated` ON `saved_routes` (`owner_id`,`updated_at`);