import { MotionConfig } from "framer-motion";
import React from "react";
import { createRoot } from "react-dom/client";
import { FavoritesScreen } from "../../components/favorites/FavoritesScreen.jsx";

let favoritesRoot;

export function mountFavoritesPage() {
  const root = document.getElementById("fusion-app-root");
  if (!root) return;
  if (!favoritesRoot) favoritesRoot = createRoot(root);
  favoritesRoot.render(<MotionConfig reducedMotion="user"><FavoritesScreen /></MotionConfig>);
}
