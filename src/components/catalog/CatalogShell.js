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
    <div class="catalog-page" id="inicio">
      <div class="catalog-ambient catalog-ambient--one"></div>
      <div class="catalog-ambient catalog-ambient--two"></div>
      <div class="catalog-grid" aria-hidden="true"></div>

      <header class="catalog-header">
        <a class="catalog-brand" href="#inicio" aria-label="Ir para o início do Fusion">
          <img src="/assets/5d0cbaa2b34ad9.png" alt="" />
          <span>Fusion</span>
        </a>

        <nav class="catalog-nav" aria-label="Navegação do Fusion">
          <a data-nav-link href="#inicio">Início</a>
          <a data-nav-link class="is-active" href="#explorar" aria-current="page">Explorar</a>
          <a data-nav-link href="#coop-local">Coop local</a>
          <a data-nav-link href="#categorias">Categorias</a>
        </nav>

        <a class="catalog-site-link" href="/">
          <span>Voltar ao site</span>
          ${arrowIcon}
        </a>
      </header>

      <section class="catalog-hero">
        <div class="catalog-kicker">
          <span class="catalog-kicker__mark">${gridIcon}</span>
          <span>Catálogo Fusion</span>
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

        <div class="catalog-filter-row" aria-label="Filtros de visualização">
          <button class="is-selected" type="button" data-filter="Todos" aria-pressed="true">Todos</button>
          <button type="button" data-filter="Coop local" aria-pressed="false">Coop local</button>
          <button type="button" data-filter="Ação" aria-pressed="false">Ação</button>
          <button type="button" data-filter="Terror" aria-pressed="false">Terror</button>
          <button type="button" data-filter="Aventura" aria-pressed="false">Aventura</button>
        </div>
      </section>

      <section class="catalog-content" id="explorar" aria-labelledby="catalog-heading">
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
            A estrutura está pronta para receber os cards dos jogos. Antes de conectar
            qualquer fonte externa, vamos definir como a biblioteca deve se comportar
            e quais informações cada card precisa mostrar.
          </p>
        </div>
      </section>

      <section class="catalog-secondary-section" id="coop-local" aria-labelledby="coop-heading">
        <span class="catalog-eyebrow">Jogar juntos</span>
        <h2 id="coop-heading">Coop local</h2>
        <p>
          Esta área será dedicada a títulos para jogar no mesmo PC, incluindo jogos de
          tela dividida quando esse recurso estiver disponível.
        </p>
      </section>

      <section class="catalog-secondary-section" id="categorias" aria-labelledby="categories-heading">
        <span class="catalog-eyebrow">Descoberta</span>
        <h2 id="categories-heading">Categorias</h2>
        <p>
          Ação, aventura, terror e outros gêneros serão organizados aqui quando a
          primeira camada de dados do catálogo estiver pronta.
        </p>
      </section>

      <footer class="catalog-footer">
        <span>Fusion</span>
        <div>
          <span>Uma experiência Vórtex</span>
          <span>Sem anúncios invasivos</span>
        </div>
      </footer>
    </div>
  `;

  const form = root.querySelector("[data-catalog-search]");
  const note = root.querySelector("[data-search-note]");
  const filterButtons = [...root.querySelectorAll("[data-filter]")];
  const navLinks = [...root.querySelectorAll("[data-nav-link]")];

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(form).get("query")?.toString().trim();

    note.textContent = query
      ? `A busca por “${query}” será ativada quando conectarmos os dados do catálogo.`
      : "Digite um nome ou gênero. A busca real será conectada em uma etapa posterior.";
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });

      note.textContent = button.dataset.filter === "Todos"
        ? "Mostrando a estrutura geral do catálogo."
        : `O filtro “${button.dataset.filter}” já responde ao clique. Os jogos entram na próxima camada de dados.`;
    });
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((item) => {
        item.classList.toggle("is-active", item === link);
        item.removeAttribute("aria-current");
      });

      link.setAttribute("aria-current", "page");
    });
  });
}
