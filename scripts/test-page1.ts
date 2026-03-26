import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { pdfToImages } from "../src/utils/pdf-to-images.js";

const client = new Anthropic();

async function main() {
	const pages = await pdfToImages(
		"/tmp/bid-tabs/Bid_Results_Anderson_Waster_System_Improvements.pdf",
	);
	console.log(`Page 1 image size: ${pages[0].image.length} bytes`);

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 16384,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: pages[0].image.toString("base64"),
						},
					},
					{
						type: "text",
						text: 'Count every numbered line item row on this page. Then return valid JSON: {"count": N, "items": [{"no": "1", "desc": "first 50 chars of description"}]}. Include ALL items.',
					},
				],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";
	console.log("stop_reason:", response.stop_reason);
	console.log("output length:", text.length);
	console.log("\n--- OUTPUT ---\n");
	console.log(text.slice(0, 2000));
	if (text.length > 2000) {
		console.log("\n... truncated ...\n");
		console.log(text.slice(-500));
	}

	process.exit(0);
}

main();
