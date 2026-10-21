import { render } from "@testing-library/react";
import { StrictMode } from "react";

import { App } from "../App.tsx";

/**
 * The one place tests compose the app. It mirrors main.tsx: when main.tsx
 * gains a provider or a root attribute, this file gains it in the same change,
 * or every UI test proves a tree the app no longer mounts.
 */
export function renderApp() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
