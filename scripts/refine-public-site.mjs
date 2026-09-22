import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { renderNavigation, authHref } from "../src/content/navigation.mjs";
import { contactEmail, guides, pageCopy } from "../src/content/public-site.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [...Object.keys(pageCopy), ...guides.map(g => `blog/${g.slug}.html`), "politica-de-privacidade/index.html", "termos-de-uso/index.html", ...readdirSync(resolve(root, "app")).filter(f => f.endsWith(".html")).map(f => `app/${f}`)];
const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const actions = `<div class="fusion-editorial-actions"><a class="fusion-button" href="/app/">Explorar catálogo <span aria-hidden="true">↗</span></a><a class="fusion-button fusion-button-secondary" href="${authHref("create")}">Criar minha conta</a></div>`;

for (const file of files) {
  const $ = load(readFileSync(resolve(root, file), "utf8"));
  const app = file.startsWith("app/");
  const legal = file.includes("/index.html") && !app;
  const article = guides.find(g => file === `blog/${g.slug}.html`);
  const path = file === "index.html" ? "/" : `/${file.replace(/index\.html$/, "")}`;
  const text = (selector, value) => $(selector).text(value);
  const replace = (from, to) => $("p,h1,h2,h3,h4,h5,h6,span").filter((_, e) => $(e).text().trim() === from && !$(e).find("p,h1,h2,h3,h4,h5,h6").length).text(to);
  $("html").attr("lang", "pt-BR");
  $("body").addClass(app ? "fusion-app" : "fusion-public").attr("data-fusion-page", article ? "guide" : file.replace(/\.html|\/index/g, ""));
  // Keep Framer's original section and card trees; replace only the shared navigation.
  $("[data-fusion-navigation], .fusion-skip").remove();
  $("nav[data-framer-name]").each((_, e) => $(e).parent().remove());
  $(".legal-header").remove();
  $("body").prepend(renderNavigation({ app, path }));
  $("#fusion-content").removeAttr("id");
  if (app) {
    const old = $("#fusion-app-root");
    old.replaceWith('<div id="fusion-content" tabindex="-1"><div id="fusion-app-root"><p class="fusion-route-loading" role="status">Preparando seu espaço no Fusion…</p></div></div>');
  } else {
    const target = $("#main").length ? $("#main") : $("main").first();
    // Preserve #main because original Framer styles and links may refer to it.
    if (target.attr("id") === "main") target.attr("tabindex", "-1").wrap('<div id="fusion-content" tabindex="-1"></div>');
    else target.attr({ id: "fusion-content", tabindex: "-1" });
  }
  $("link[data-fusion-style]").remove();
  $("head").append('<link data-fusion-style rel="stylesheet" href="/css/fusion-navigation.css">');
  if (!app) $("head").append('<link data-fusion-style rel="stylesheet" href="/css/fusion-public.css">');
  const meta = article ? [`${article.title} — Fusion`, article.description] : pageCopy[file];
  if (meta) {
    text("title", meta[0]);
    $("meta[name=description],meta[property^='og:'],meta[name^='twitter:'],link[rel=canonical]").remove();
    $("head").append(`<meta name="description" content="${escape(meta[1])}"><meta property="og:title" content="${escape(meta[0])}"><meta property="og:description" content="${escape(meta[1])}"><meta property="og:type" content="${article ? "article" : "website"}"><meta property="og:image" content="https://fusionapp.site/assets/fusion/${article?.cover || "A"}.png"><link rel="canonical" href="https://fusionapp.site${path}">`);
  }
  if (app || file === "404.html") {
    $("meta[name=robots]").remove();
    $("head").append('<meta name="robots" content="noindex,follow">');
  }
  if (app) { writeFileSync(resolve(root, file), $.html()); continue; }

  $("header[data-framer-name=Hero]").addClass("fusion-public-hero");
  $("section[data-framer-name]").filter((_, e) => !$(e).parents("section[data-framer-name]").length).addClass("fusion-section");
  $("h1,h2").parent('[data-framer-component-type="RichTextContainer"]').addClass("fusion-heading-wrap");
  $("section[data-framer-name] > [data-framer-name='Main Container']").addClass("fusion-section-inner");
  $("[data-framer-name='Authors']").remove();
  $("a[href]").each((_, e) => {
    const a = $(e), href = a.attr("href"), label = a.text().trim();
    if (/^mailto:/i.test(href)) a.attr("href", `mailto:${contactEmail}`);
    if (/https?:\/\/(www\.)?(twitter|x|linkedin|instagram|framer)\.com/i.test(href)) { a.remove(); return; }
    if (label === "Catálogo" || label === "Fusion" || label === "Waitlist") a.attr("href", "/app/");
    if (/^(Contato|Contact|Contato support|Contato Support|Enviar sugestão)$/i.test(label)) a.attr("href", "/contact.html");
    if (/^(Dúvidas|FAQ’s|FAQ|Ajuda)$/.test(label)) a.attr("href", "/waitlist.html#faq");
    if (/^(Privacidade|Privacy Policy|Política de privacidade)$/.test(label) || /privacy-policy\.html/.test(href)) a.attr("href", "/politica-de-privacidade/");
    if (/^(Como funciona|Sobre|Sobre o Fusion|Features|Product Overview)$/.test(label)) a.attr("href", "/#product-overview");
    if (/^(Pricing|Acesso)$/.test(label)) a.attr("href", "/#pricing");
    if (/^(Testimonials|Experiência)$/.test(label)) a.attr("href", "/#testimonial");
    if (/^(Novidades|Blogs|Guias|Back to blogs|View All Blogs)$/.test(label)) a.attr("href", "/blog.html");
    if (/^(Atualizações|Changelog)$/.test(label)) a.attr("href", "/changelog.html");
    if (/^(Home|Início)$/.test(label)) a.attr("href", "/");
    if (label === "404") a.remove();
    if (a.attr("target") === "_blank") a.attr("rel", "noopener noreferrer");
  });
  const vocabulary = {
    "JotaHub Inc.": "Fusion", "Fusion by Vórtex": contactEmail, "Fale com a equipe": contactEmail,
    "hello@suprema.com": contactEmail, "Plan and navigate from idea to launch.": "Descubra o que jogar. Guarde o que vale voltar.",
    "All Systems Operational": "Feito para descobrir", "Fusion em construção": "Feito para descobrir",
    "Quick Navigation": "Explore", "Navegação": "Explore", "All Pages": "Fusion", "Páginas": "Fusion", "Social Handles": "", "Redes": "",
    "Product Overview": "Sobre o Fusion", "Features": "Como funciona", "Pricing": "Acesso", "Testimonials": "Experiência", "FAQ’s": "Ajuda",
    "Home": "Início", "Waitlist": "Catálogo", "Contact": "Contato", "Blogs": "Guias", "Changelog": "Novidades", "Privacy Policy": "Privacidade",
    "© 2025 Todos os direitos reservados": "© 2026 Fusion", "© 2026 Todos os direitos reservados": "© 2026 Fusion",
    "Start your 7-day free trial": "Sua próxima descoberta está aqui.", "Sem anúncios. Sem conteúdo adulto. Sem ruído.": "Jogos de PC. Espaço para descobrir.",
    "Sem anúncios invasivos. Sem conteúdo sexual explícito.": "Explore livremente. Crie uma conta para salvar favoritos.",
    "Our Novidades": "Guias do Fusion", "Our Featured Novidades": "Para começar", "All Novidades": "Continue explorando",
    "Back to blogs": "Voltar aos guias", "Similar Blogs": "Continue descobrindo", "View All Blogs": "Todos os guias", "Read Full Blog": "Ler guia", "Ler conteúdo": "Ler guia",
    "Contato Us": "Estamos por aqui", "Help & support": "Precisa de ajuda?", "Contato support for any issues or assistance with using Fusion.": "Conte o que aconteceu e em qual página. Se for sobre um jogo, inclua o nome dele.", "Contato Support": "Falar com o suporte",
    "Oops page not found": "Página não encontrada", "76%": "PC", "12M+": "Coop", "600+": "Sua lista", "20+": "Fusion",
    "Catálogo vivo": "Explore o catálogo", "Conheça o Fusion": "Encontre seu caminho no Fusion", "Buscar novidades": "Explorar os guias",
  };
  for (const [from, to] of Object.entries(vocabulary)) replace(from, to);
  $("p").each((_, e) => {
    const p = $(e), t = p.text();
    if (/Antes de iniciar o atendimento|cérebro do Vórtex/.test(t)) p.text("Comece por um título, um gênero ou uma vontade de jogar. Combine filtros e abra os detalhes para conhecer cada descoberta.");
    if (/Ele pode se conectar às ferramentas/.test(t)) p.text("Descrição, imagens, modos de jogo e requisitos disponíveis ficam juntos. Você encontra o contexto para escolher antes de seguir para uma fonte externa.");
    if (/Be amongst the first|Sign up to be notified/.test(t)) p.text("Da primeira busca aos seus favoritos: veja como aproveitar o Fusion.");
    if (/2024/.test(t) && t.length < 35) p.text("22 de set. de 2026");
  });

  // Covers follow the article they open, including cards in related-guide sections.
  $("a[href]").each((_, e) => {
    const card = $(e), guide = guides.find(g => card.attr("href").includes(g.slug));
    if (!guide) return;
    card.attr("href", `/blog/${guide.slug}.html`);
    card.find("h3,h4,h5,h6").text(guide.title);
    card.find("img").attr({ src: `/assets/fusion/${guide.cover}.png`, alt: guide.title, loading: "lazy" }).removeAttr("srcset").addClass("fusion-guide-cover");
    card.find("p").each((_, p) => { if ($(p).text().length > 80) $(p).text(guide.description); });
  });
  $("footer").addClass("fusion-public-footer");
  $("footer").each((_, e) => {
    const footer = $(e);
    footer.find("img").first().attr({ src: "/assets/5d0cbaa2b34ad9.png", alt: "Fusion" });
    if (!footer.find("a[href='/termos-de-uso/']").length) footer.append('<div class="fusion-footer-legal"><a href="/termos-de-uso/">Termos de uso</a><a href="/politica-de-privacidade/">Privacidade</a></div>');
  });
  if (legal) $(".legal-footer").html(`<a href="/app/">Abrir catálogo</a><a href="mailto:${contactEmail}">${contactEmail}</a><a href="${file.startsWith("termos") ? "/politica-de-privacidade/" : "/termos-de-uso/"}">${file.startsWith("termos") ? "Privacidade" : "Termos de uso"}</a>`);

  if (file === "index.html") {
    text("h1", "Seu próximo jogo.\nUm novo começo.");
    $(".fusion-public-hero").attr("data-fusion-hero", "");
    $(".framer-ap69l4").addClass("fusion-hero-copy");
    $(".framer-1ib1p16").find("p").filter((_, e) => $(e).text().length > 100).text("Descubra jogos de PC, encontre companhia para a próxima partida e guarde seus favoritos. Tudo começa com uma boa escolha.");
    if (!$(".fusion-product-stage").length) $(".fusion-public-hero").append('<figure class="fusion-product-stage" data-fusion-reveal><img src="/assets/fusion/notebook%20com%20gameplay%20do%20forza.png" alt="Notebook com uma cena de corrida, ilustração de uma próxima partida" width="1536" height="1024" fetchpriority="high"><figcaption>Encontre o que faz você querer jogar.</figcaption></figure>');
    $(".framer-7hgh73 img").attr({ src: "/assets/fusion/3.png", alt: "Ilustração da biblioteca Fusion" });
    $(".framer-15he270").addClass("fusion-access-grid").html(`<article class="fusion-access-card"><span class="fusion-eyebrow">Comece explorando</span><h3>Uma descoberta<br>puxa a próxima.</h3><p>O catálogo é aberto. Pesquise jogos, combine filtros e consulte os detalhes.</p><a class="fusion-button" href="/app/">Explorar catálogo <span aria-hidden="true">↗</span></a></article><article class="fusion-access-card"><span class="fusion-eyebrow">Faça do seu jeito</span><h3>Vale guardar.<br>Vale voltar.</h3><p>Crie sua conta para salvar favoritos e encontrar sua lista em outros dispositivos.</p><a class="fusion-button fusion-button-secondary" href="${authHref("create")}">Criar minha conta</a></article>`);
    $(".framer-976y6w").remove();
    $(".framer-5ftwif").remove();
    $(".framer-w1o4ny").attr("aria-label", "Ilustrações da experiência Fusion");
  }
  if (file === "blog.html") {
    text("h1", "Boas descobertas\ncomeçam por aqui.");
    $("a").filter((_, e) => $(e).text().trim() === "Explorar os guias").attr("href", "#blog-1");
    $("#blog-1").find("p").filter((_, e) => $(e).text().startsWith("Comece por um título")).text("Ideias e primeiros passos para aproveitar melhor o seu tempo de jogo.");
  }
  if (article) {
    text("h1", article.title);
    $("[data-framer-name='Blog Content']").addClass("fusion-article-body").html(`<p class="fusion-article-lead">${article.description}</p>${article.sections.map(([title, body], i) => `<section id="guia-${i + 1}"><h2>${title}</h2><p>${body}</p></section>`).join("")}<div class="fusion-article-end">${actions}</div>`);
    $("[data-framer-name='Author Details'], [data-framer-name='Author Profile']").each((_, e) => $(e).html('<span class="fusion-guide-byline">Equipe Fusion · 22 de setembro de 2026</span>'));
    $("[data-framer-name='Date'] p").text("22 de setembro de 2026");
    $("[data-framer-name='Side Nav']").addClass("fusion-guide-aside").html(`<span class="fusion-eyebrow">Neste guia</span><nav aria-label="Neste guia">${article.sections.map(([title], i) => `<a href="#guia-${i + 1}">${title}</a>`).join("")}</nav><a class="fusion-button" href="/app/">Abrir o Fusion</a>`);
    // The first large article image is the editorial cover; keep its original frame.
    const cover = $("[data-framer-name='Blog'] img").first();
    cover.attr({ src: `/assets/fusion/${article.cover}.png`, alt: article.title, loading: "eager" }).removeAttr("srcset").addClass("fusion-guide-cover");
    $("p").filter((_, e) => /^(Efficiency|Productivity|Collaboration|Task Management|Time Management)$/.test($(e).text())).text(article.category);
  }
  if (file === "changelog.html") {
    replace("Acompanhe as etapas que estão transformando o Fusion de uma base visual em um catálogo completo.", "O que já faz parte da sua experiência — e o que vem a seguir.");
    const changes = ["Pesquise jogos e combine filtros no catálogo.", "Abra os detalhes para ver descrição, imagens e requisitos disponíveis.", "Salve favoritos usando sua conta Fusion.", "Retome sua lista em outros dispositivos com a mesma conta.", "Encontre Catálogo, Favoritos e Minha conta no menu do aplicativo.", "Volte às páginas públicas pelo atalho Voltar ao site.", "Explore jogos em companhia pela área de coop local.", "Consulte os modos de jogo antes de organizar a partida.", "Encontre a página da Steam e fontes externas nos detalhes, quando disponíveis.", "Fusion AI está em desenvolvimento. Sua experiência ainda pode mudar.", "Envie dúvidas e sugestões pelo contato do Fusion."];
    let i = 0;
    $("p").filter((_, e) => $(e).text().startsWith("Etapa:")).each((_, e) => $(e).text(changes[i++ % changes.length]));
    replace("Base do aplicativo", "Descobrir. Salvar. Voltar.");
    replace("Estrutura", "No catálogo"); replace("Produto", "Sua biblioteca"); replace("Próximas camadas", "Em evolução");
    replace("A interface ganhou navegação real entre as áreas principais sem depender de dados externos.", "Os caminhos entre o site, o catálogo e a sua conta ficam reunidos em um menu consistente.");
    replace("A primeira tela foi compactada de forma adaptativa para caber melhor em desktops com menor altura de viewport.", "Entre para ver seus favoritos ou explore livremente. O acesso ao site continua por perto.");
    replace("Busca e filtros já respondem visualmente e estão prontos para receber dados reais do catálogo.", "Pesquise e combine os filtros disponíveis para aproximar os resultados do que você quer jogar.");
    replace("A área interna passou a usar React e Framer Motion para feedback de hover, clique e entrada dos elementos.", "Confira os detalhes de cada descoberta e ajuste os filtros quando quiser ampliar a seleção.");
  }
  // No pretend newsletter submissions. CTA frames now lead to a working account flow.
  $("form").each((_, e) => {
    const form = $(e);
    if (file !== "contact.html") {
      const attrs = { ...e.attribs }; delete attrs["data-local-form"]; delete attrs.action; delete attrs.method;
      const frame = $("<div>").attr(attrs).addClass("fusion-form-actions").html(actions);
      form.replaceWith(frame);
    } else {
      form.attr({ "data-fusion-contact": "", action: `mailto:${contactEmail}`, method: "post", enctype: "text/plain" }).removeAttr("data-local-form");
      form.find("input[type=text]").attr({ name: "name", autocomplete: "name", maxlength: "120", required: "" });
      form.find("input[type=email]").attr({ name: "email", autocomplete: "email", maxlength: "254", required: "" });
      form.find("textarea").attr({ name: "message", maxlength: "5000", required: "", placeholder: "Como podemos ajudar?" });
      form.find("button[type=submit]").attr("aria-label", "Preparar e-mail").find("p").text("Preparar e-mail");
      if (!form.next().hasClass("fusion-contact-note")) form.after(`<p class="fusion-contact-note">O botão prepara a mensagem no seu aplicativo de e-mail. Você revisa e envia por lá. Ou escreva para <a href="mailto:${contactEmail}">${contactEmail}</a>.</p>`);
    }
  });
  // Mark only genuine Fusion illustrations; preserve decorative gradients and textures.
  $("img[src*='/fusion/']").each((_, e) => {
    const img = $(e), src = img.attr("src");
    if (/\/4\.png$/.test(src)) img.attr("src", "/assets/fusion/6.png");
    if (/\/\d\.png$/.test(src)) img.addClass("fusion-ui-illustration").attr("alt", "Ilustração conceitual do Fusion; dados de exemplo");
    if (!img.closest(".fusion-public-hero").length) img.attr("loading", "lazy");
    img.attr("decoding", "async");
  });
  $(".fusion-section > .fusion-section-inner, .fusion-article-body > section").attr("data-fusion-reveal", "");
  writeFileSync(resolve(root, file), $.html());
}

// Keep the old exported policy address valid with one authoritative document.
writeFileSync(resolve(root, "privacy-policy.html"), '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/politica-de-privacidade/"><link rel="canonical" href="https://fusionapp.site/politica-de-privacidade/"><title>Privacidade — Fusion</title></head><body><p>A política está em <a href="/politica-de-privacidade/">Política de Privacidade do Fusion</a>.</p></body></html>');
console.log(`Refinadas ${files.length} páginas. Conteúdo e navegação compartilhados aplicados.`);
