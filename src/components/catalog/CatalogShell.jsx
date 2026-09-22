import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const searchIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
  </svg>
);

const arrowIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const gridIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
);

const navItems = [
  { label: "Início", href: "#inicio" },
  { label: "Explorar", href: "#explorar" },
  { label: "Coop local", href: "#coop-local" },
  { label: "Categorias", href: "#categorias" },
];

const filters = ["Todos", "Coop local", "Ação", "Terror", "Aventura"];
const ease = [0.22, 1, 0.36, 1];

export function CatalogShell() {
  const [activeNav, setActiveNav] = useState("Explorar");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [note, setNote] = useState(
    "A busca visual já está pronta. Os dados serão conectados em uma etapa posterior.",
  );

  function submitSearch(event) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("query")?.toString().trim();

    setNote(
      query
        ? `A busca por “${query}” será ativada quando conectarmos os dados do catálogo.`
        : "Digite um nome ou gênero. A busca real será conectada em uma etapa posterior.",
    );
  }

  function selectFilter(filter) {
    setActiveFilter(filter);
    setNote(
      filter === "Todos"
        ? "Mostrando a estrutura geral do catálogo."
        : `O filtro “${filter}” já responde ao clique. Os jogos entram na próxima camada de dados.`,
    );
  }

  return (
    <div className="catalog-page" id="inicio">
      <div className="catalog-ambient catalog-ambient--one" />
      <div className="catalog-ambient catalog-ambient--two" />
      <div className="catalog-grid" aria-hidden="true" />

      <motion.header
        className="catalog-header"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <motion.a
          className="catalog-brand"
          href="#inicio"
          aria-label="Ir para o início do Fusion"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
        >
          <img src="/assets/5d0cbaa2b34ad9.png" alt="" />
          <span>Fusion</span>
        </motion.a>

        <nav className="catalog-nav" aria-label="Navegação do Fusion">
          {navItems.map((item) => (
            <motion.a
              key={item.label}
              href={item.href}
              className={activeNav === item.label ? "is-active" : undefined}
              aria-current={activeNav === item.label ? "page" : undefined}
              onClick={() => setActiveNav(item.label)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              {item.label}
            </motion.a>
          ))}
        </nav>

        <motion.a
          className="catalog-site-link"
          href="/"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <span>Voltar ao site</span>
          {arrowIcon}
        </motion.a>
      </motion.header>

      <motion.section
        className="catalog-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease }}
      >
        <motion.div className="catalog-kicker" whileHover={{ scale: 1.015 }}>
          <span className="catalog-kicker__mark">{gridIcon}</span>
          <span>Catálogo Fusion</span>
        </motion.div>

        <h1>Encontre seu próximo jogo.</h1>
        <p>
          Uma biblioteca de jogos de PC pensada para ser simples de explorar:
          sem anúncios invasivos, sem conteúdo sexual explícito e com espaço
          para descobrir desde coop local até terror, ação e aventura.
        </p>

        <motion.form
          className="catalog-search"
          onSubmit={submitSearch}
        >
          <span className="catalog-search__icon">{searchIcon}</span>
          <input
            type="search"
            name="query"
            autoComplete="off"
            placeholder="Pesquise por nome, gênero ou descrição..."
            aria-label="Pesquisar jogos"
          />
          <motion.button
            type="submit"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
          >
            <span>Pesquisar</span>
            {arrowIcon}
          </motion.button>
        </motion.form>

        <AnimatePresence mode="wait">
          <motion.div
            key={note}
            className="catalog-search-note"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {note}
          </motion.div>
        </AnimatePresence>

        <div className="catalog-filter-row" aria-label="Filtros de visualização">
          {filters.map((filter) => (
            <motion.button
              key={filter}
              type="button"
              className={activeFilter === filter ? "is-selected" : undefined}
              aria-pressed={activeFilter === filter}
              onClick={() => selectFilter(filter)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
            >
              {filter}
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="catalog-content"
        id="explorar"
        aria-labelledby="catalog-heading"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.18 }}
        transition={{ duration: 0.5, ease }}
      >
        <div className="catalog-content__heading">
          <div>
            <span className="catalog-eyebrow">Biblioteca</span>
            <h2 id="catalog-heading">Jogos em destaque</h2>
          </div>
          <span className="catalog-status">Base visual</span>
        </div>

        <motion.div
          className="catalog-empty"
          whileHover={{ borderColor: "rgba(255,255,255,.13)" }}
        >
          <div className="catalog-empty__icon">{gridIcon}</div>
          <h3>O catálogo começa aqui.</h3>
          <p>
            A estrutura está pronta para receber os cards dos jogos. Antes de conectar
            qualquer fonte externa, vamos definir como a biblioteca deve se comportar
            e quais informações cada card precisa mostrar.
          </p>
        </motion.div>
      </motion.section>

      <motion.section
        className="catalog-secondary-section"
        id="coop-local"
        aria-labelledby="coop-heading"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.22 }}
        transition={{ duration: 0.45, ease }}
      >
        <span className="catalog-eyebrow">Jogar juntos</span>
        <h2 id="coop-heading">Coop local</h2>
        <p>
          Esta área será dedicada a títulos para jogar no mesmo PC, incluindo jogos de
          tela dividida quando esse recurso estiver disponível.
        </p>
      </motion.section>

      <motion.section
        className="catalog-secondary-section"
        id="categorias"
        aria-labelledby="categories-heading"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.22 }}
        transition={{ duration: 0.45, ease }}
      >
        <span className="catalog-eyebrow">Descoberta</span>
        <h2 id="categories-heading">Categorias</h2>
        <p>
          Ação, aventura, terror e outros gêneros serão organizados aqui quando a
          primeira camada de dados do catálogo estiver pronta.
        </p>
      </motion.section>

      <footer className="catalog-footer">
        <span>Fusion</span>
        <div>
          <span>Uma experiência Vórtex</span>
          <span>Sem anúncios invasivos</span>
        </div>
      </footer>
    </div>
  );
}
