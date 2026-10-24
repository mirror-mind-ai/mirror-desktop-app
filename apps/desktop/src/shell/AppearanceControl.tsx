import { Monitor, Moon, Sun } from "lucide-react";

import type { ThemePreference } from "../theme/resolve.ts";
import { cycleAppearance, useTheme } from "../theme/store.ts";

const ICONS = { system: Monitor, dark: Moon, light: Sun } as const satisfies Record<ThemePreference, unknown>;

/**
 * One quiet button that cycles the appearance: system, dark, light. Its icon
 * shows the current choice and its name states it, so a person can see where
 * they are before pressing it.
 */
export function AppearanceControl() {
  const preference = useTheme((state) => state.preference);
  const Icon = ICONS[preference];
  const label = `Appearance: ${preference}`;
  return (
    <button type="button" aria-label={label} title={label} onClick={cycleAppearance} className="flex items-center hover:text-ink">
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}
