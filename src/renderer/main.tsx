import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devMock } from "./devMock";
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
