import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devMock } from "./devMock";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/dotgothic16/index.css";
import "./styles.css";

// Fora do Electron (pre-visualizacao no browser) instala um motor SO.
if (!window.solver) {
  window.solver = devMock;
}

const container = document.getElementById("root");
if (!container) throw new Error("root element missing");
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
