CREATE TABLE `dashboard_data` (
	`period` text NOT NULL,
	`scope` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`period`, `scope`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_started` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
