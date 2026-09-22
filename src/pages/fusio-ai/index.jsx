import React from "react";
import { createRoot } from "react-dom/client";
import { FusioAI } from "../../components/fusio/FusioAI.jsx";

let fusioRoot;

export function mountFusioAI() {
  let host = document.getElementById("fusio-ai-root");
  if (!host) {
    host = document.createElement("div");
    host.id = "fusio-ai-root";
    document.body.append(host);
  }

  if (!fusioRoot) {
    fusioRoot = createRoot(host);
  }

  fusioRoot.render(<FusioAI />);
}
