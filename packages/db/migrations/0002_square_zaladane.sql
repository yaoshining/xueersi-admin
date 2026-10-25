CREATE TABLE `sync_jobs` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL
);
