import { ensureAppRoot } from "../components/AppRoot.js";
import { resolvePage } from "../pages/registry.js";

export function bootApplication() {
  const page = resolvePage(window.location.pathname);
  const appRoot = ensureAppRoot(document);

  document.documentElement.dataset.vortexApp = "ready";

  if (page) {
    document.documentElement.dataset.vortexPage = page.id;
  }

  if (page?.id === "catalog") {
    import("../pages/catalog/index.jsx").then(({ mountCatalogPage }) => {
      mountCatalogPage();
    });
  }

  return { appRoot, page };
}
