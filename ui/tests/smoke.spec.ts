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
