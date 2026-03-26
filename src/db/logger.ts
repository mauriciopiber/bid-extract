/**
 * Pipeline logger that writes to both console and DB.
 * Every step gets a run_log entry.
 */

import { db, schema } from "./index.js";

export class PipelineLogger {
	private extractionId: number | null = null;

	setExtractionId(id: number) {
		this.extractionId = id;
	}

	async log(
		step: string,
		message: string,
		data?: unknown,
		level = "info",
	) {
		console.log(`  ${message}`);

		if (this.extractionId) {
			await db.insert(schema.runLogs).values({
				extractionId: this.extractionId,
				step,
				level,
				message,
				data: data as Record<string, unknown>,
			});
		}
	}

	async warn(step: string, message: string, data?: unknown) {
		return this.log(step, message, data, "warn");
	}

	async error(step: string, message: string, data?: unknown) {
		return this.log(step, message, data, "error");
	}
}
