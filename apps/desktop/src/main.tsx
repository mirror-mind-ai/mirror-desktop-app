import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { browserThemeEnvironment } from "./theme/environment.ts";
import { bootTheme } from "./theme/lifecycle.ts";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

// Before the first render, so the first frame is already in the person's theme.
// renderApp() boots the same way, in the same place.
bootTheme(browserThemeEnvironment());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
