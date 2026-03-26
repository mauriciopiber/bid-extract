/**
 * Robustly parse JSON from LLM output.
 * Handles markdown code fences, trailing text, etc.
 */
export function parseJsonResponse<T>(text: string): T {
	// Try direct parse first
	try {
		return JSON.parse(text);
	} catch {
		// Strip markdown code fences
		const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
		if (fenced) {
			return JSON.parse(fenced[1].trim());
		}

		// Try to find JSON object in the text
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start !== -1 && end !== -1) {
			return JSON.parse(text.slice(start, end + 1));
		}

		throw new Error(
			`Could not parse JSON from response: ${text.slice(0, 200)}`,
		);
	}
}
