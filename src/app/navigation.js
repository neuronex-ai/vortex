import { supabase } from "../lib/supabase.js";
import { FUSION_ROUTES, authHref } from "../content/navigation.mjs";

export function initializeNavigation() {
  const header = document.querySelector("[data-fusion-navigation]");
  if (!header || header.dataset.ready) return;
  header.dataset.ready = "true";
  const toggle = header.querySelector(".fusion-menu-toggle");
  const menu = header.querySelector(".fusion-mobile-navigation");
  const setOpen = (open) => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  };
  toggle.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); }
  });
  document.addEventListener("click", (event) => { if (!header.contains(event.target)) setOpen(false); });
  const update = (user) => {
    header.querySelectorAll("[data-fusion-signin]").forEach((link) => {
      link.textContent = user ? "Minha conta" : "Entrar";
      link.href = user ? FUSION_ROUTES.account : authHref();
    });
    header.querySelectorAll("[data-fusion-signup]").forEach((link) => {
      link.textContent = user ? "Abrir Fusion" : "Criar conta";
      link.href = user ? FUSION_ROUTES.catalog : authHref("create");
    });
  };
  // Session is only used to label navigation, never to authorize database access.
  supabase.auth.getSession().then(({ data }) => update(data.session?.user)).catch(() => update(null));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => update(session?.user));
  window.addEventListener("pagehide", (event) => { if (!event.persisted) data.subscription.unsubscribe(); }, { once: true });
}
