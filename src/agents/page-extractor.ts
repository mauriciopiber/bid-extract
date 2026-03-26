/**
 * Page Extractor
 *
 * Extracts data from a SINGLE page based on its page type.
 * Each page type gets a different extraction prompt.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PageClassification } from "./classifier.js";
import { parseJsonResponse } from "../utils/parse-json.js";

const client = new Anthropic();

export interface PageExtractionResult {
	pageNumber: number;
	pageType: string;
	data: Record<string, unknown>;
}

const PAGE_PROMPTS: Record<string, string> = {
	bid_ranking: `Extract the bid ranking from this page. This page shows bidder names and their total bid amounts.

Respond with ONLY valid JSON:
{
  "bidders": [
    {
      "rank": 1,
      "name": "Company Name",
      "totalBaseBid": 500000,
      "address": "address if visible",
      "phone": "phone if visible"
    }
  ],
  "project": {
    "name": "project name if visible",
    "projectId": "project ID if visible",
    "owner": "owner if visible",
    "bidDate": "date if visible"
  }
}

Rules:
- Rank 1 = lowest bidder
- All monetary values as numbers (no $ signs, no commas)
- Do NOT fabricate line items — this is a ranking page, not a tabulation
- If ranks are not shown, rank by total (lowest = 1)`,

	bid_tabulation: `Extract the bid tabulation data from this page. This page shows line items with quantities and prices.

Respond with ONLY valid JSON:
{
  "sections": [
    {
      "name": "section name if visible (e.g., Bridge Items, Roadway Items)",
      "items": [
        {
          "itemNo": "1",
          "description": "Item description",
          "section": "section name",
          "unit": "LS",
          "quantity": 1,
          "bids": [
            {"bidder": "Company A", "unitPrice": 100.00, "extendedPrice": 100.00},
            {"bidder": "Company B", "unitPrice": 120.00, "extendedPrice": 120.00}
          ],
          "engineerEstimate": {"unitPrice": 90.00, "extendedPrice": 90.00}
        }
      ],
      "subtotal": {"Company A": 50000, "Company B": 60000}
    }
  ],
  "continuedFromPrevious": false,
  "continuedOnNext": false,
  "notes": "anything notable about this page"
}

Rules:
- Extract ALL bidders visible as columns
- Extract ALL line items visible as rows
- If items have sub-items (a, b, c under item 1), preserve the hierarchy with itemNo like "1", "1a", "1b"
- If section headers are visible, group items under their section
- All monetary values as numbers
- Only set unitPrice if explicitly shown — NEVER back-calculate
- Set continuedFromPrevious=true if this page continues a table from a previous page
- Set continuedOnNext=true if the table continues on the next page`,

	cover: `Extract project information from this cover page.

Respond with ONLY valid JSON:
{
  "project": {
    "name": "project name/title",
    "projectId": "project number/ID",
    "owner": "owner entity",
    "bidDate": "bid opening date",
    "location": "project location",
    "description": "project description/scope"
  },
  "engineer": "engineering firm name if visible",
  "contracts": ["list of contract names/numbers if this covers multiple contracts"]
}`,

	summary: `Extract summary information from this page.

Respond with ONLY valid JSON:
{
  "lowBidder": "name of low bidder if stated",
  "totalBids": [{"bidder": "name", "total": 500000}],
  "engineerEstimate": 450000,
  "notes": "any other summary information"
}`,

	other: `Describe what you see on this page briefly.

Respond with ONLY valid JSON:
{
  "description": "what this page contains",
  "hasRelevantData": false
}`,
};

export async function extractPage(
	pageImage: Buffer,
	classification: PageClassification,
): Promise<PageExtractionResult> {
	const prompt =
		PAGE_PROMPTS[classification.pageType] ?? PAGE_PROMPTS.other;

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 8192,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: pageImage.toString("base64"),
						},
					},
					{ type: "text", text: prompt },
				],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";
	const data = parseJsonResponse<Record<string, unknown>>(text);

	return {
		pageNumber: classification.pageNumber,
		pageType: classification.pageType,
		data,
	};
}
