import React from "react";
import { createRoot } from "react-dom/client";
import { AccountScreen } from "../../components/account/AccountScreen.jsx";

let accountRoot;

export function mountAccountPage() {
  const root = document.getElementById("fusion-app-root");
  if (!root) return;
  if (!accountRoot) accountRoot = createRoot(root);
  accountRoot.render(<AccountScreen />);
}
