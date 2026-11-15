import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Empty mount point for Lane 4's side panel UI.
createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
