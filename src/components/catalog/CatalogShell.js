const searchIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"></path>
  </svg>
`;

const arrowIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6"></path>
  </svg>
`;

const gridIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="2"></rect>
    <rect x="14" y="3" width="7" height="7" rx="2"></rect>
    <rect x="3" y="14" width="7" height="7" rx="2"></rect>
    <rect x="14" y="14" width="7" height="7" rx="2"></rect>
  </svg>
`;

export function renderCatalogShell(root) {
  root.innerHTML = `
    <div class="catalog-page">
      <div class="catalog-ambient catalog-ambient--one"></div>
      <div class="catalog-ambient catalog-ambient--two"></div>
      <div class="catalog-grid" aria-hidden="true"></div>

      <header class="catalog-header">
        <a class="catalog-brand" href="/" aria-label="Voltar para o site Vórtex">
          <img src="/assets/5d0cbaa2b34ad9.png" alt="" />
          <span>Vórtex</span>
        </a>

        <nav class="catalog-nav" aria-label="Navegação do catálogo">
          <a href="/">Início</a>
          <a class="is-active" href="/app/" aria-current="page">Explorar</a>
          <button type="button" disabled>Coop local</button>
          <button type="button" disabled>Categorias</button>
        </nav>

        <a class="catalog-site-link" href="/">
          <span>Voltar ao site</span>
          ${arrowIcon}
        </a>
      </header>

      <section class="catalog-hero">
        <div class="catalog-kicker">
          <span class="catalog-kicker__mark">${gridIcon}</span>
          <span>Catálogo Vórtex</span>
        </div>

        <h1>Encontre seu próximo jogo.</h1>
        <p>
          Uma biblioteca de jogos de PC pensada para ser simples de explorar:
          sem anúncios invasivos, sem conteúdo sexual explícito e com espaço
          para descobrir desde coop local até terror, ação e aventura.
        </p>

        <form class="catalog-search" data-catalog-search>
          <span class="catalog-search__icon">${searchIcon}</span>
          <input
            type="search"
            name="query"
            autocomplete="off"
            placeholder="Pesquise por nome, gênero ou descrição..."
            aria-label="Pesquisar jogos"
          />
          <button type="submit">
            <span>Pesquisar</span>
            ${arrowIcon}
          </button>
        </form>

        <div class="catalog-search-note" data-search-note>
          A busca visual já está pronta. Os dados serão conectados em uma etapa posterior.
        </div>

        <div class="catalog-filter-row" aria-label="Filtros que serão habilitados posteriormente">
          <button class="is-selected" type="button" disabled>Todos</button>
          <button type="button" disabled>Coop local</button>
          <button type="button" disabled>Ação</button>
          <button type="button" disabled>Terror</button>
          <button type="button" disabled>Aventura</button>
        </div>
      </section>

      <section class="catalog-content" aria-labelledby="catalog-heading">
        <div class="catalog-content__heading">
          <div>
            <span class="catalog-eyebrow">Biblioteca</span>
            <h2 id="catalog-heading">Jogos em destaque</h2>
          </div>
          <span class="catalog-status">Base visual</span>
        </div>

        <div class="catalog-empty">
          <div class="catalog-empty__icon">${gridIcon}</div>
          <h3>O catálogo começa aqui.</h3>
          <p>
            Nesta primeira etapa deixamos a interface pronta e vazia de propósito.
            Na próxima fase podemos definir os cards e a navegação antes de conectar
            qualquer fonte externa.
          </p>
        </div>
      </section>

      <footer class="catalog-footer">
        <span>Vórtex</span>
        <div>
          <span>Sem anúncios invasivos</span>
          <span>Interface em construção</span>
        </div>
      </footer>
    </div>
  `;

  const form = root.querySelector("[data-catalog-search]");
  const note = root.querySelector("[data-search-note]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(form).get("query")?.toString().trim();

    note.textContent = query
      ? `A busca por “${query}” será ativada quando conectarmos os dados do catálogo.`
      : "Digite um nome ou gênero. A busca real será conectada em uma etapa posterior.";
  });
}
