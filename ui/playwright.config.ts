import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 15000,
	use: {
		baseURL: "http://localhost:3001",
	},
	webServer: {
		command: "npx next dev -p 3001",
		port: 3001,
		reuseExistingServer: true,
	},
});
