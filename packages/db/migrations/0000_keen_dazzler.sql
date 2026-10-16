CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`subject` text NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL
);
