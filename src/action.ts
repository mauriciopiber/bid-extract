import { z } from "zod/v4";

/**
 * Unified Action Factory
 *
 * One definition → works from CLI, MCP, API, and web.
 * DB is the source of truth. Disk is optional debug dump.
 */

export interface ActionConfig<TInput, TOutput> {
	name: string;
	description: string;
	input: z.ZodType<TInput>;
	handler: (input: TInput) => Promise<TOutput>;
	formats?: {
		cli?: (output: TOutput) => void;
	};
}

export function createAction<TInput, TOutput>(
	config: ActionConfig<TInput, TOutput>,
) {
	const execute = async (raw: unknown): Promise<TOutput> => {
		const input = config.input.parse(raw) as TInput;
		return config.handler(input);
	};

	return {
		name: config.name,
		description: config.description,
		input: config.input,
		execute,

		cli: async (args: Record<string, unknown>): Promise<void> => {
			try {
				const result = await execute(args);
				if (config.formats?.cli) {
					config.formats.cli(result);
				} else {
					console.log(JSON.stringify(result, null, 2));
				}
			} catch (error) {
				if (error instanceof z.ZodError) {
					console.error("Validation error:", JSON.stringify(error.issues, null, 2));
					process.exit(1);
				}
				console.error("Error:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		},

		api: {
			POST: async (req: Request): Promise<Response> => {
				try {
					const input = await req.json();
					const result = await execute(input);
					return Response.json(result);
				} catch (error) {
					if (error instanceof z.ZodError) {
						return Response.json({ error: "Validation error", details: error.issues }, { status: 400 });
					}
					const message = error instanceof Error ? error.message : String(error);
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	};
}

export type Action<TInput, TOutput> = ReturnType<typeof createAction<TInput, TOutput>>;
