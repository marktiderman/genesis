import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { takeFragment } from "./client";
import "./wizard.css";

const { step } = takeFragment();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App {...(step ? { step } : {})} />
  </StrictMode>,
);
