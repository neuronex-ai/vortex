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
const blogDirectory = resolve(projectRoot, "blog");
const blogPages = statSync(blogDirectory).isDirectory() ? collectHtmlFiles(blogDirectory) : [];
const htmlInputs = Object.fromEntries(
  [...rootPages, ...blogPages].map((path) => [toInputName(path), path]),
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
      transformIndexHtml: {
        order: "post",
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
