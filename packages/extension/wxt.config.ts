import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

const e2e = process.env.CONJURE_E2E === "1";

export default defineConfig({
  imports: false,
  // The e2e build exposes test hooks and an open shadow root, so it never
  // shares an output directory with the build that gets loaded for real use.
  outDirTemplate: e2e
    ? "{{browser}}-mv{{manifestVersion}}-e2e"
    : "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  manifest: {
    name: "Conjure Element",
    description: "Inspect resolved CSS and copy it to Figma.",
    permissions: ["scripting", "activeTab", "clipboardWrite"],
    // Needed to refetch cross-origin stylesheets and images from the worker.
    host_permissions: ["<all_urls>"],
    action: { default_title: "Conjure Element" },
  },
  vite: () => ({
    plugins: [preact()],
    define: { __CONJURE_E2E__: JSON.stringify(e2e) },
  }),
});
