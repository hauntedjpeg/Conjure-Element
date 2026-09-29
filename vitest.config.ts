import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/src/**/*.test.ts", "packages/*/scripts/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["packages/*/src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
