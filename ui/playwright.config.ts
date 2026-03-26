import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 15000,
	use: {
		baseURL: "http://localhost:3001",
	},
	// Server must be running externally — we don't manage it here
	// Start with: cd ui && npx next dev -p 3001
});
