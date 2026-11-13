import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import contentStyles from "./content.css?inline";

const HOST_ID = "excali-save-root";

function mount() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-excali-save", "");

  // Events from inside the shadow root reach Excalidraw retargeted to this host,
  // so it cannot tell they came from a text field and would run its shortcuts
  // (Backspace deletes shapes, letters switch tools, paste lands on the canvas).
  for (const type of ["keydown", "keyup", "keypress", "paste", "copy", "cut"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = contentStyles;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  document.documentElement.appendChild(host);

  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
