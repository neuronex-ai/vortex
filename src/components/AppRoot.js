export function ensureAppRoot(documentRef = document) {
  const existingRoot = documentRef.getElementById("vortex-app-root");

  if (existingRoot) {
    return existingRoot;
  }

  const root = documentRef.createElement("div");
  root.id = "vortex-app-root";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  documentRef.body.append(root);

  return root;
}
