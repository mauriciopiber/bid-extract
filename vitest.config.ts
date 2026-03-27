import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    env: {
      DOTENV_CONFIG_PATH: ".env",
    },
    setupFiles: ["dotenv/config"],
    exclude: ["**/node_modules/**", "**/ui/**", "**/test-results/**"],
    include: ["src/**/*.test.ts", "evals/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
