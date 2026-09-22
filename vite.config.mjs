import { readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

function collectHtmlFiles(directory) {
  return readdirSync(directory)
    .map((name) => resolve(directory, name))
    .filter((path) => statSync(path).isFile() && extname(path) === ".html");
}

function toInputName(path) {
  return relative(projectRoot, path)
    .replace(/\\/g, "/")
    .replace(/\.html$/, "")
    .replace(/\//g, "-") || "index";
}

const rootPages = collectHtmlFiles(projectRoot);
const blogPages = collectHtmlFiles(resolve(projectRoot, "blog"));
const appPages = collectHtmlFiles(resolve(projectRoot, "app"));
const legalPages = [
  resolve(projectRoot, "politica-de-privacidade", "index.html"),
  resolve(projectRoot, "termos-de-uso", "index.html"),
];
const legalRouteTargets = new Map([
  ["/politica-de-privacidade", "/politica-de-privacidade/index.html"],
  ["/termos-de-uso", "/termos-de-uso/index.html"],
]);

function rewriteLegalRoute(request) {
  const [pathname, query = ""] = request.url.split("?");
  const target = legalRouteTargets.get(pathname);

  if (target) request.url = query ? `${target}?${query}` : target;
}
const htmlInputs = Object.fromEntries(
  [...rootPages, ...blogPages, ...appPages, ...legalPages].map((path) => [toInputName(path), path]),
);

export default defineConfig({
  root: projectRoot,
  appType: "mpa",
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  plugins: [
    {
      name: "vortex-app-bootstrap",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          rewriteLegalRoute(request);
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, _response, next) => {
          rewriteLegalRoute(request);
          next();
        });
      },
      transformIndexHtml: {
        order: "pre",
        handler() {
          return [
            {
              tag: "script",
              attrs: {
                type: "module",
                src: "/src/main.js",
              },
              injectTo: "body",
            },
          ];
        },
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: htmlInputs,
    },
  },
});
