import { MotionConfig } from "framer-motion";
import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogShell } from "../../components/catalog/CatalogShell.jsx";
import "../../styles/catalog.css";

let catalogRoot;

export function mountCatalogPage() {
  const root = document.getElementById("fusion-app-root");

  if (!root) return;

  if (!catalogRoot) {
    catalogRoot = createRoot(root);
  }

  catalogRoot.render(<MotionConfig reducedMotion="user"><CatalogShell /></MotionConfig>);
}
