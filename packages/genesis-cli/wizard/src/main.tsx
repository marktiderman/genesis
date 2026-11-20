import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { takeFragment } from "./client";
import "./wizard.css";

// Follow the system's light or dark mode: the theme's dark tokens hang off `.dark` on <html>.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const followScheme = () => document.documentElement.classList.toggle("dark", dark.matches);
followScheme();
dark.addEventListener("change", followScheme);

void takeFragment().then(({ step }) =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App {...(step ? { step } : {})} />
    </StrictMode>,
  ),
);
