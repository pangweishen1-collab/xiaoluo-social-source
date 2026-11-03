CREATE TABLE `danmaku_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`content` text NOT NULL,
	`sender` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_danmaku_created` ON `danmaku_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_danmaku_sender_created` ON `danmaku_messages` (`sender`,`created_at`);