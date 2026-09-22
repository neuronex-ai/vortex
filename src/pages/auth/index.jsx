import React from "react";
import { createRoot } from "react-dom/client";
import { AuthScreen } from "../../components/auth/AuthScreen.jsx";
import "../../styles/auth.css";

let authRoot;

export function mountAuthPage() {
  const root = document.getElementById("fusion-app-root");
  if (!root) return;

  if (!authRoot) authRoot = createRoot(root);
  authRoot.render(<AuthScreen />);
}
