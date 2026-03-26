import { test, expect } from "@playwright/test";

test("home page loads with layouts", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("h1")).toContainText("Bid Extract");
	// Should not have any errors
	await expect(page.locator("body")).not.toContainText("Error");
});

test("layouts API returns data", async ({ request }) => {
	const res = await request.get("/api/layouts");
	expect(res.ok()).toBe(true);
	const data = await res.json();
	expect(Array.isArray(data)).toBe(true);
});

test("extractions API returns data", async ({ request }) => {
	const res = await request.get("/api/extractions");
	expect(res.ok()).toBe(true);
	const data = await res.json();
	expect(Array.isArray(data)).toBe(true);
});

test("extraction detail page loads without crash", async ({ page }) => {
	// Get first extraction ID from API
	const res = await page.request.get("/api/extractions");
	const extractions = await res.json();

	if (extractions.length === 0) {
		test.skip();
		return;
	}

	const id = extractions[0].id;
	await page.goto(`/review/${id}`);

	// Should show the extraction header, not crash
	await expect(page.locator("header")).toBeVisible();
	await expect(page.locator("body")).not.toContainText("TypeError");
	await expect(page.locator("body")).not.toContainText("is not a function");
});

test("extraction pages API returns per-page data", async ({ request }) => {
	// Get first extraction
	const extRes = await request.get("/api/extractions");
	const extractions = await extRes.json();
	if (extractions.length === 0) return;

	const id = extractions[0].id;
	const res = await request.get(`/api/extractions/${id}/pages`);
	expect(res.ok()).toBe(true);
	const pages = await res.json();
	expect(Array.isArray(pages)).toBe(true);
});

test("extraction detail shows bidder totals and engineer estimate", async ({ page }) => {
	const res = await page.request.get("/api/extractions");
	const extractions = await res.json();
	if (extractions.length === 0) {
		test.skip();
		return;
	}

	// Find an extraction that has bidders with totals
	const extRes = await page.request.get(`/api/extractions/${extractions[0].id}`);
	const data = await extRes.json();
	const hasBidderTotal = data.bidders?.some((b: { totalBaseBid?: number }) => b.totalBaseBid != null);
	const hasEngEstimate = data.engineerEstimate?.total != null;

	if (!hasBidderTotal && !hasEngEstimate) {
		test.skip();
		return;
	}

	await page.goto(`/review/${extractions[0].id}`);
	// Click aggregate tab to see totals
	const aggTab = page.getByRole("tab", { name: /aggregate/i });
	if (await aggTab.isVisible()) {
		await aggTab.click();
	}
	await page.waitForTimeout(500);

	const body = await page.locator("body").textContent();

	// If bidder has a total, it MUST appear in the UI
	if (hasBidderTotal) {
		const total = data.bidders.find((b: { totalBaseBid?: number }) => b.totalBaseBid)?.totalBaseBid;
		// Check the dollar amount appears somewhere on the page
		expect(body).toContain(total.toLocaleString(undefined, { minimumFractionDigits: 2 }));
	}

	// If engineer estimate exists, it MUST appear in the UI
	if (hasEngEstimate) {
		const engTotal = data.engineerEstimate.total;
		expect(body).toContain(engTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }));
	}
});

test("layout detail page loads", async ({ page }) => {
	const res = await page.request.get("/api/layouts");
	const layouts = await res.json();
	if (layouts.length === 0) {
		test.skip();
		return;
	}

	await page.goto(`/layout-view/${layouts[0].id}`);
	await expect(page.locator("header")).toBeVisible();
	await expect(page.locator("body")).not.toContainText("TypeError");
});
