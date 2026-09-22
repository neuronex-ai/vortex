import { ensureAppRoot } from "../components/AppRoot.js";
import { resolvePage } from "../pages/registry.js";
import { initializeNavigation } from "./navigation.js";
import { initializePublicExperience } from "./public-experience.js";

export function bootApplication() {
  initializeNavigation();
  initializePublicExperience();
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

  if (page?.id === "auth") {
    import("../pages/auth/index.jsx").then(({ mountAuthPage }) => {
      mountAuthPage();
    });
  }

  if (page?.id === "account") {
    import("../pages/account/index.jsx").then(({ mountAccountPage }) => {
      mountAccountPage();
    });
  }

  if (page?.id === "favorites") {
    import("../pages/favorites/index.jsx").then(({ mountFavoritesPage }) => {
      mountFavoritesPage();
    });
  }

  if (page?.id === "welcome") {
    import("../pages/welcome/index.jsx").then(({ mountWelcomePage }) => mountWelcomePage());
  }

  if (["catalog", "account", "favorites"].includes(page?.id)) {
    import("../pages/fusion-ai/index.jsx").then(({ mountFusionAI }) => {
      mountFusionAI();
    });
  }

  return { appRoot, page };
}
