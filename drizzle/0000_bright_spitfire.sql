CREATE TABLE `fetch_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_url` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	`http_status` integer,
	`html_bytes` integer,
	`html_sha256` text,
	`html_gzip_bytes` integer,
	`raw_html_encoding` text DEFAULT 'gzip-base64-chunks' NOT NULL,
	`parser_version` text NOT NULL,
	`model_count` integer DEFAULT 0 NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `fetch_runs_status_completed_idx` ON `fetch_runs` (`status`,`completed_at`);--> statement-breakpoint
CREATE INDEX `fetch_runs_started_idx` ON `fetch_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `model_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`model_key` text NOT NULL,
	`source_id` text,
	`slug` text,
	`name` text NOT NULL,
	`short_name` text,
	`creator_name` text,
	`creator_slug` text,
	`release_date` text,
	`knowledge_cutoff_date` text,
	`total_cost` real,
	`input_cost` real,
	`output_cost` real,
	`reasoning_cost` real,
	`answer_cost` real,
	`intelligence` real,
	`coding` real,
	`agentic` real,
	`mmmu` real,
	`price_input_1m` real,
	`price_output_1m` real,
	`active_params` real,
	`is_open_weights` integer,
	`is_reasoning` integer,
	`raw_result_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `fetch_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_results_run_model_unique` ON `model_results` (`run_id`,`model_key`);--> statement-breakpoint
CREATE INDEX `model_results_run_idx` ON `model_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `model_results_model_idx` ON `model_results` (`model_key`);--> statement-breakpoint
CREATE INDEX `model_results_name_idx` ON `model_results` (`name`);--> statement-breakpoint
CREATE TABLE `raw_html_chunks` (
	`run_id` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`data` text NOT NULL,
	`byte_length` integer NOT NULL,
	PRIMARY KEY(`run_id`, `chunk_index`),
	FOREIGN KEY (`run_id`) REFERENCES `fetch_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
