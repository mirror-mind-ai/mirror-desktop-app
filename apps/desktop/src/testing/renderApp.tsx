import { render } from "@testing-library/react";
import { StrictMode } from "react";

import { App } from "../App.tsx";
import { resetAllStores } from "../stores/registry.ts";
import { browserThemeEnvironment } from "../theme/environment.ts";
import { bootTheme } from "../theme/lifecycle.ts";
import { scriptWindow } from "./appearance.ts";

/**
 * The one place tests compose the app. It mirrors main.tsx: when main.tsx
 * gains a provider, a root attribute or a step before rendering, this file
 * gains it in the same change, or every UI test proves a tree the app no
 * longer mounts.
 *
 * The stores live as long as the module, not the tree, so every render starts
 * them from their initial state: no test inherits the last one's Journey.
 * Then the theme boots as the app boots it, before the first render, against
 * a window whose two theme commands are answered.
 */
export function renderApp() {
  resetAllStores();
  scriptWindow();
  bootTheme(browserThemeEnvironment());
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
