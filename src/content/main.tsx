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
