import test from "node:test";
import assert from "node:assert/strict";
import { safeAppReturn, authHref, signedInDestination, renderNavigation } from "../src/content/navigation.mjs";
import { resolvePage } from "../src/pages/registry.js";
import { load } from "cheerio";

test("Authentication returns only to recognized app destinations, preserving game links and filters", () => {
  for (const path of ["/app/", "/app/?game=stardew-valley#explorar", "/app/favorites.html", "/app/account.html"]) assert.equal(safeAppReturn(path), path);
  for (const path of ["https://evil.test/app/", "//evil.test/app/", "/app/../../outside", "/app/%2e%2e/contact.html", "/app/\\evil.test", "/app/auth.html", "/app/welcome.html", "/app/unknown.html", null, "\r\n/app/"]) assert.equal(safeAppReturn(path), "/app/");
});
test("Create-account links select signup and keep the requested destination", () => {
  const link = new URL(authHref("create", "/app/favorites.html"), "https://fusion.test");
  assert.equal(link.searchParams.get("mode"), "create");
  assert.equal(link.searchParams.get("next"), "/app/favorites.html");
});
test("New registrations see the tour once; returning users reach their destination", () => {
  const first = new URL(signedInDestination({ user_metadata: {} }, { next: "/app/favorites.html", onboarding: true }), "https://fusion.test");
  assert.equal(first.pathname, "/app/welcome.html");
  assert.equal(first.searchParams.get("next"), "/app/favorites.html");
  assert.equal(signedInDestination({ user_metadata: { fusion_welcome_completed: true } }, { next: "/app/favorites.html", onboarding: true }), "/app/favorites.html?auth=success");
  assert.equal(signedInDestination({}, { next: "/app/?game=abc#explorar" }), "/app/?game=abc&auth=success#explorar");
});
test("Catalog aliases and welcome page resolve to the correct application screen", () => {
  for (const path of ["/app", "/app/", "/app/index.html"]) assert.equal(resolvePage(path).id, "catalog");
  assert.equal(resolvePage("/app/welcome.html").id, "welcome");
});
test("Both navigation surfaces expose a real catalog and auth flow; app retains return to site", () => {
  for (const app of [true, false]) {
    const $ = load(renderNavigation({ app, path: app ? "/app/" : "/" }));
    assert.equal($("header").length, 1);
    assert.equal($("button[aria-controls=fusion-mobile-navigation]").length, 1);
    assert.equal($("#fusion-mobile-navigation[hidden]").length, 1);
    assert.ok($("nav a[href='/app/']").length);
    assert.ok($("a[data-fusion-signup]").attr("href").includes("mode=create"));
    if (app) assert.ok($("a[href='/']").toArray().some(e => $(e).text() === "Voltar ao site"));
  }
});
