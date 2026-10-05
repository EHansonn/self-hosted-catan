import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { configureBrand, DEFAULT_APP_NAME, getAppName } from "./branding";
import { configureResourceNames, type ResourceNames } from "../shared/resources";
import "./styles.css";
import "./crossroads.css";
import "./game-ui.css";
import "./dark-mode.css";

async function start() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) {
      const config = (await response.json()) as {
        appName?: unknown;
        resourceNames?: ResourceNames;
      };
      configureBrand(config.appName);
      if (config.resourceNames) configureResourceNames(config.resourceNames);
    }
  } catch {
    configureBrand(DEFAULT_APP_NAME);
  }

  const appName = getAppName();
  document.title = appName;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      `Play ${appName} with friends or bots in a private 2D or 3D game.`,
    );

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
