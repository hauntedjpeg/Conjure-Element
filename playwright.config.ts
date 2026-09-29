import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Each test launches its own browser profile with the extension loaded.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5180" },
  webServer: {
    command: "node e2e/server.mjs",
    url: "http://localhost:5180/basic/",
    reuseExistingServer: true,
  },
});
