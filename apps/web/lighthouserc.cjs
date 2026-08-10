const { chromium } = require("@playwright/test");

const host = "127.0.0.1";
const port = 4174;
const origin = `http://${host}:${port}`;

module.exports = {
  ci: {
    collect: {
      chromePath: chromium.executablePath(),
      numberOfRuns: 2,
      startServerCommand: `npm run start -- --hostname ${host} --port ${port}`,
      startServerReadyPattern: "http://|listening|ready",
      startServerReadyTimeout: 120_000,
      url: [
        `${origin}/`,
        `${origin}/learn/agent-loop`,
        `${origin}/agents/opencode/opencode-2026-08-10-source`,
        `${origin}/compare`,
      ],
      settings: {
        chromeFlags: "--headless --no-sandbox --disable-dev-shm-usage",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        preset: "desktop",
      },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 1, aggregationMethod: "median" }],
        "categories:best-practices": ["error", { minScore: 1, aggregationMethod: "median" }],
        "categories:performance": ["error", { minScore: 0.8, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 0.95, aggregationMethod: "median" }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".artifacts/lighthouse",
    },
  },
};
