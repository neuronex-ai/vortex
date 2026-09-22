import React from "react";
import { createRoot } from "react-dom/client";
import { FusionAI } from "../../components/fusion/FusionAI.jsx";

let fusionRoot;

export function mountFusionAI() {
  let host = document.getElementById("fusion-ai-root");
  if (!host) {
    host = document.createElement("div");
    host.id = "fusion-ai-root";
    document.body.append(host);
  }

  if (!fusionRoot) {
    fusionRoot = createRoot(host);
  }

  fusionRoot.render(<FusionAI />);
}
