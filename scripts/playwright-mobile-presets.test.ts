// The shared Playwright config's phone projects are phones.
//
// `devices["iPhone 13 mini"]` was never a Playwright device (the name is
// "iPhone 13 Mini"), so the spread was `{}` and "mobile-375" ran as a narrow
// desktop window. This test loads the real config and checks the fields that
// make an emulated phone a phone, so the mistake cannot come back by rename.
import { describe, expect, test } from "bun:test";
import { devices } from "@playwright/test";
import config from "../playwright.config";
import { requireNativeMobilePreset } from "./recruiter-real-ci-mobile-preset";

const project = (name: string) => {
  const p = (config.projects ?? []).find((x) => x.name === name);
  if (!p) throw new Error(`project ${name} is missing`);
  return p.use as Record<string, unknown>;
};

describe("playwright mobile presets", () => {
  test("the preset names resolve to Playwright devices", () => {
    expect(devices["iPhone 13 Mini"]).toBeDefined();
    expect(devices["iPhone 14"]).toBeDefined();
    expect(devices["iPhone 13 mini"]).toBeUndefined();
    expect(() => requireNativeMobilePreset(devices, "iPhone 13 mini", 375)).toThrow(
      "REAL_CI_MOBILE_PRESET_INVALID",
    );
  });

  test.each([
    ["mobile-375", 375, 812],
    ["mobile-390", 390, 844],
  ])("%s is an emulated phone, not a narrow desktop", (name, width, height) => {
    const use = project(name);
    expect(use.browserName).toBe("chromium");
    expect(use.isMobile).toBe(true);
    expect(use.hasTouch).toBe(true);
    expect(use.deviceScaleFactor).toBe(3);
    expect(use.viewport).toEqual({ width, height });
    expect(typeof use.userAgent).toBe("string");
    expect(String(use.userAgent)).toMatch(/iPhone|Mobile/);
  });

  test("the desktop project is not a phone", () => {
    const use = project("chromium");
    expect(use.isMobile ?? false).toBe(false);
    expect(use.hasTouch ?? false).toBe(false);
  });
});
