export const FUSION_ROUTES = Object.freeze({
  home: "/", catalog: "/app/", auth: "/app/auth.html", welcome: "/app/welcome.html",
  favorites: "/app/favorites.html", account: "/app/account.html", guides: "/blog.html",
  updates: "/changelog.html", help: "/waitlist.html", contact: "/contact.html",
  privacy: "/politica-de-privacidade/", terms: "/termos-de-uso/",
});

export function safeAppReturn(value = "/app/") {
  try {
    if (!value.startsWith("/app/") || /[\\\r\n]/u.test(value)) return FUSION_ROUTES.catalog;
    const url = new URL(value, "https://fusion.invalid");
    const allowed = ["/app/", "/app/index.html", FUSION_ROUTES.favorites, FUSION_ROUTES.account];
    if (url.origin !== "https://fusion.invalid" || !allowed.includes(url.pathname)) return FUSION_ROUTES.catalog;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return FUSION_ROUTES.catalog; }
}

export function authHref(mode = "sign-in", next = "/app/") {
  return `${FUSION_ROUTES.auth}?${new URLSearchParams({ mode, next: safeAppReturn(next) })}`;
}

export function signedInDestination(user, { next = "/app/", onboarding = false } = {}) {
  const destination = safeAppReturn(next);
  if (onboarding && !user?.user_metadata?.fusion_welcome_completed) {
    return `${FUSION_ROUTES.welcome}?${new URLSearchParams({ next: destination })}`;
  }
  const url = new URL(destination, "https://fusion.invalid");
  url.searchParams.set("auth", "success");
  return `${url.pathname}${url.search}${url.hash}`;
}

function link(label, href, active) {
  return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
}

export function renderNavigation({ app = false, path = "/" } = {}) {
  const links = app
    ? [["Catálogo", FUSION_ROUTES.catalog], ["Favoritos", FUSION_ROUTES.favorites], ["Minha conta", FUSION_ROUTES.account]]
    : [["O Fusion", "/"], ["Catálogo", FUSION_ROUTES.catalog], ["Guias", FUSION_ROUTES.guides], ["Novidades", FUSION_ROUTES.updates], ["Ajuda", FUSION_ROUTES.help]];
  return `<a class="fusion-skip" href="#fusion-content">Pular para o conteúdo</a>
  <header class="fusion-navigation" data-fusion-navigation>
    <div class="fusion-navigation-inner">
      <a class="fusion-wordmark" href="/" aria-label="Fusion — página inicial"><img src="/assets/5d0cbaa2b34ad9.png" alt="" width="28" height="28"><span>Fusion</span>${app ? '<small>Biblioteca</small>' : ""}</a>
      <nav class="fusion-nav-links" aria-label="Navegação principal">${links.map(([label, href]) => link(label, href, path === href)).join("")}</nav>
      <div class="fusion-nav-actions">${app ? '<a class="fusion-return" href="/">Voltar ao site</a>' : ""}<a data-fusion-signin href="${authHref()}">Entrar</a><a class="fusion-nav-primary" data-fusion-signup href="${authHref("create")}">Criar conta</a></div>
      <button class="fusion-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="fusion-mobile-navigation"><span></span><span></span></button>
    </div>
    <nav id="fusion-mobile-navigation" class="fusion-mobile-navigation" aria-label="Navegação em telas menores" hidden>${links.map(([label, href]) => link(label, href, path === href)).join("")}${app ? '<a href="/">Voltar ao site</a>' : '<a href="/contact.html">Contato</a>'}<a data-fusion-signin href="${authHref()}">Entrar</a><a data-fusion-signup href="${authHref("create")}">Criar conta</a></nav>
  </header>`;
}
