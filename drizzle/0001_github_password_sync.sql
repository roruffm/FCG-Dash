CREATE TABLE `auth_passwords` (
	`role` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_sync_events` (
	`jti` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
