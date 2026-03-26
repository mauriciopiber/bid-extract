/**
 * Promptfoo custom provider
 *
 * Runs the bid-extract pipeline on a PDF and returns the extraction result.
 * promptfoo calls this, then runs assertions against the output.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dirname, "..");

export default class BidExtractProvider {
  id() {
    return "bid-extract-pipeline";
  }

  async callApi(prompt, context) {
    const pdf = context.vars?.pdf;
    if (!pdf) {
      return { error: "No pdf var provided" };
    }

    const outputDir = join(PROJECT_ROOT, "evals", "output");

    try {
      // Run extraction via CLI
      execSync(
        `npx tsx src/cli.ts extract "${pdf}" -o "${outputDir}" --max-corrections 1`,
        {
          cwd: PROJECT_ROOT,
          timeout: 120000,
          env: { ...process.env, DOTENV_CONFIG_PATH: join(PROJECT_ROOT, ".env") },
        }
      );

      // Find the output JSON
      const pdfName = pdf.split("/").pop().replace(".pdf", "");
      const outputPath = join(outputDir, `${pdfName}.json`);
      const result = JSON.parse(readFileSync(outputPath, "utf-8"));

      return {
        output: result,
      };
    } catch (err) {
      return {
        error: err.message,
      };
    }
  }
}
