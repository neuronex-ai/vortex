export function normalizePath(pathname = "/") {
  const cleanPath = pathname.split("?")[0].split("#")[0] || "/";

  if (cleanPath === "/index.html") {
    return "/";
  }

  if (cleanPath === "/app" || cleanPath === "/app/index.html") {
    return "/app/";
  }

  return cleanPath;
}
