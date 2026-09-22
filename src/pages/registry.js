import { normalizePath } from "../lib/path.js";

export const pages = [
  { id: "home", path: "/", source: "index.html" },
  { id: "catalog", path: "/app/", source: "app/index.html" },
  { id: "blog", path: "/blog.html", source: "blog.html" },
  { id: "changelog", path: "/changelog.html", source: "changelog.html" },
  { id: "contact", path: "/contact.html", source: "contact.html" },
  { id: "privacy-policy", path: "/privacy-policy.html", source: "privacy-policy.html" },
  { id: "waitlist", path: "/waitlist.html", source: "waitlist.html" },
  { id: "not-found", path: "/404.html", source: "404.html" },
];

export function resolvePage(pathname) {
  const path = normalizePath(pathname);
  const exactPage = pages.find((page) => page.path === path);

  if (exactPage) {
    return exactPage;
  }

  if (path.startsWith("/blog/") && path.endsWith(".html")) {
    return {
      id: "blog-article",
      path,
      source: path.slice(1),
    };
  }

  return null;
}
