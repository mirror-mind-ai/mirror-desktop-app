import { render } from "@testing-library/react";
import { StrictMode } from "react";

import { App } from "../App.tsx";
import { resetAllStores } from "../stores/registry.ts";

/**
 * The one place tests compose the app. It mirrors main.tsx: when main.tsx
 * gains a provider or a root attribute, this file gains it in the same change,
 * or every UI test proves a tree the app no longer mounts.
 *
 * The stores live as long as the module, not the tree, so every render starts
 * them from their initial state: no test inherits the last one's Journey.
 */
export function renderApp() {
  resetAllStores();
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
