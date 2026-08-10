import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessibilityRoutes = [
  { name: "home", path: "/" },
  { name: "academy", path: "/learn" },
  { name: "lesson", path: "/learn/agent-loop" },
  { name: "mechanism", path: "/mechanisms/context-compaction" },
  { name: "agent atlas", path: "/agents" },
  { name: "agent snapshot", path: "/agents/opencode/opencode-2026-08-10-source" },
  { name: "snapshot timeline", path: "/agents/codex/timeline" },
  {
    name: "snapshot diff",
    path: "/agents/codex/diff/codex-2026-08-10-cli__codex-2026-08-10-source",
  },
  { name: "architecture compare", path: "/compare" },
  { name: "evidence explorer", path: "/evidence" },
  { name: "experiment lab", path: "/lab" },
  { name: "controlled experiment", path: "/lab/experiments/reference-tool-roundtrip-v1" },
  { name: "trace player", path: "/lab/traces/reference-tool-roundtrip-v1-run-001" },
  { name: "knowledge search", path: "/search" },
];

const visualStabilizer = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    caret-color: transparent !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }
  html { scroll-behavior: auto !important; }
`;

async function settle(page, path) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: visualStabilizer });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("automated accessibility baseline", () => {
  for (const route of accessibilityRoutes) {
    test(`${route.name} has no detectable WCAG A/AA violations`, async ({ page }, testInfo) => {
      await settle(page, route.path);
      await expect(page.locator("#main-content > main")).toHaveCount(1);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      await testInfo.attach("axe-results", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      const violationFingerprints = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target.join(" > ")),
      }));
      expect(violationFingerprints).toEqual([]);
    });
  }

  test("mobile navigation opens and closes from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, "/");
    const toggle = page.locator(".mobile-nav-toggle");

    await expect(toggle).toHaveAccessibleName(/打开菜单|Open menu/);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAccessibleName(/关闭菜单|Close menu/);
    await expect(page.locator("#primary-navigation")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName(/打开菜单|Open menu/);
    await expect(toggle).toBeFocused();
  });
});

test.describe("visual regression baseline", () => {
  test("home desktop viewport", async ({ page }) => {
    await settle(page, "/");
    await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: false });
  });

  test("lesson desktop viewport", async ({ page }) => {
    await settle(page, "/learn/agent-loop");
    await expect(page).toHaveScreenshot("lesson-desktop.png", { fullPage: false });
  });

  test("home mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, "/");
    await expect(page).toHaveScreenshot("home-mobile.png", { fullPage: false });
  });
});
