import { describe, expect, it } from "vitest";
import { parseJsonResponse } from "./parse-json.js";

describe("parseJsonResponse", () => {
	it("parses clean JSON", () => {
		const result = parseJsonResponse<{ name: string }>('{"name":"test"}');
		expect(result.name).toBe("test");
	});

	it("strips markdown code fences", () => {
		const input = '```json\n{"name":"test"}\n```';
		const result = parseJsonResponse<{ name: string }>(input);
		expect(result.name).toBe("test");
	});

	it("strips code fences without language tag", () => {
		const input = '```\n{"name":"test"}\n```';
		const result = parseJsonResponse<{ name: string }>(input);
		expect(result.name).toBe("test");
	});

	it("extracts JSON from surrounding text", () => {
		const input = 'Here is the result:\n{"name":"test"}\nHope that helps!';
		const result = parseJsonResponse<{ name: string }>(input);
		expect(result.name).toBe("test");
	});

	it("throws on no JSON found", () => {
		expect(() => parseJsonResponse("no json here")).toThrow(
			"Could not parse JSON",
		);
	});

	it("handles nested objects", () => {
		const input = '{"project":{"name":"Bridge","id":"123"},"bidders":[]}';
		const result = parseJsonResponse<{
			project: { name: string; id: string };
			bidders: unknown[];
		}>(input);
		expect(result.project.name).toBe("Bridge");
		expect(result.bidders).toEqual([]);
	});
});
