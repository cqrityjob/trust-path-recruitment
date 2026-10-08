import type { devices } from "@playwright/test";

type DevicePreset = (typeof devices)[string];

export function requireNativeMobilePreset(
  presets: typeof devices,
  name: string,
  width: number,
): DevicePreset {
  const preset = presets[name];
  if (
    !preset ||
    preset.isMobile !== true ||
    preset.hasTouch !== true ||
    preset.viewport?.width !== width
  ) {
    throw new Error("REAL_CI_MOBILE_PRESET_INVALID");
  }
  return preset;
}
