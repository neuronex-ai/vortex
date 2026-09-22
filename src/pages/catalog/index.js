import { renderCatalogShell } from "../../components/catalog/CatalogShell.js";
import "../../styles/catalog.css";

export function mountCatalogPage() {
  const root = document.getElementById("vortex-catalog-root");

  if (!root) {
    return;
  }

  renderCatalogShell(root);
}
