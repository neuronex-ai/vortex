import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { categories, gameMatchesQuery, games } from "../../data/games.js";
import { GameCard } from "./GameCard.jsx";
import { GameDetail } from "./GameDetail.jsx";
import "../../styles/catalog-enhancements.css";

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

const menuIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 7h14M5 12h14M5 17h14" />
  </svg>
);

const closeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("popular");
  const [selectedGame, setSelectedGame] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const openFromUrl = () => {
      const slug = new URLSearchParams(window.location.search).get("game");
      setSelectedGame(games.find((game) => game.slug === slug) ?? null);
    };

    openFromUrl();
    window.addEventListener("popstate", openFromUrl);
    return () => window.removeEventListener("popstate", openFromUrl);
  }, []);

  const filteredGames = useMemo(() => {
    let list = games.filter((game) => {
      if (!gameMatchesQuery(game, query)) return false;
      if (activeFilter === "Todos") return true;
      if (activeFilter === "Coop local") return game.localCoop;
      return [...game.genres, ...game.tags].includes(activeFilter);
    });

    list = [...list].sort((a, b) => {
      if (sort === "recentes") return b.year - a.year;
      if (sort === "nome") return a.title.localeCompare(b.title, "pt-BR");
      return b.popularity - a.popularity;
    });

    return list;
  }, [activeFilter, query, sort]);

  const coopGames = useMemo(
    () => games.filter((game) => game.localCoop).sort((a, b) => b.popularity - a.popularity).slice(0, 4),
    [],
  );

  function openGame(game) {
    const url = new URL(window.location.href);
    url.searchParams.set("game", game.slug);
    window.history.pushState({}, "", url);
    setSelectedGame(game);
  }

  function closeGame() {
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    window.history.pushState({}, "", url);
    setSelectedGame(null);
  }

  function submitSearch(event) {
    event.preventDefault();
    document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectFilter(filter) {
    setActiveFilter(filter);
    document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectNav(item) {
    setActiveNav(item.label);
    setMobileOpen(false);
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
          onClick={() => {
            setActiveNav("Início");
            setMobileOpen(false);
          }}
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
              onClick={() => selectNav(item)}
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

        <motion.button
          className="catalog-mobile-toggle"
          type="button"
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
          whileTap={{ scale: 0.94 }}
        >
          {mobileOpen ? closeIcon : menuIcon}
        </motion.button>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              className="catalog-mobile-backdrop"
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.nav
              className="catalog-mobile-nav"
              aria-label="Navegação mobile do Fusion"
              initial={{ opacity: 0, y: -12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.2, ease }}
            >
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={activeNav === item.label ? "is-active" : undefined}
                  onClick={() => selectNav(item)}
                >
                  <span>{item.label}</span>
                  {arrowIcon}
                </a>
              ))}
              <a href="/">Voltar ao site</a>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

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

        <motion.form className="catalog-search" onSubmit={submitSearch}>
          <span className="catalog-search__icon">{searchIcon}</span>
          <input
            type="search"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="Pesquise por nome, gênero ou descrição..."
            aria-label="Pesquisar jogos"
          />
          <motion.button type="submit" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
            <span>Pesquisar</span>
            {arrowIcon}
          </motion.button>
        </motion.form>

        <div className="catalog-search-note" aria-live="polite">
          {query
            ? `${filteredGames.length} resultado(s) para “${query}”.`
            : "Busca por título, gênero, tags e descrição — usando dados locais temporários."}
        </div>

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
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.5, ease }}
      >
        <div className="catalog-content__heading">
          <div>
            <span className="catalog-eyebrow">Biblioteca</span>
            <h2 id="catalog-heading">{activeFilter === "Todos" ? "Jogos em destaque" : activeFilter}</h2>
          </div>

          <div className="catalog-toolbar">
            <span className="catalog-status">{filteredGames.length} jogos</span>
            <label className="catalog-sort">
              <span>Ordenar</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="popular">Populares</option>
                <option value="recentes">Mais recentes</option>
                <option value="nome">Nome A–Z</option>
              </select>
            </label>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {filteredGames.length ? (
            <motion.div className="game-grid" layout>
              {filteredGames.map((game) => (
                <GameCard key={game.slug} game={game} onOpen={openGame} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              className="catalog-empty"
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="catalog-empty__icon">{gridIcon}</div>
              <h3>Nenhum jogo encontrado.</h3>
              <p>Tente outro termo ou volte para “Todos”.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <motion.section
        className="catalog-secondary-section"
        id="coop-local"
        aria-labelledby="coop-heading"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.45, ease }}
      >
        <div className="catalog-section-heading">
          <div>
            <span className="catalog-eyebrow">Jogar juntos</span>
            <h2 id="coop-heading">Coop local</h2>
            <p>Uma seleção rápida para jogar no mesmo PC, lado a lado.</p>
          </div>
          <button type="button" onClick={() => selectFilter("Coop local")}>Ver todos</button>
        </div>

        <div className="game-grid game-grid--compact">
          {coopGames.map((game) => (
            <GameCard key={game.slug} game={game} onOpen={openGame} compact />
          ))}
        </div>
      </motion.section>

      <motion.section
        className="catalog-secondary-section"
        id="categorias"
        aria-labelledby="categories-heading"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.18 }}
        transition={{ duration: 0.45, ease }}
      >
        <span className="catalog-eyebrow">Descoberta</span>
        <h2 id="categories-heading">Categorias</h2>
        <p>Use as categorias abaixo como atalhos para a biblioteca.</p>

        <div className="category-grid">
          {categories.map((category) => {
            const count = games.filter((game) =>
              category === "Coop local"
                ? game.localCoop
                : [...game.genres, ...game.tags].includes(category),
            ).length;

            return (
              <motion.button
                type="button"
                key={category}
                onClick={() => selectFilter(category)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>{category}</span>
                <strong>{count}</strong>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      <footer className="catalog-footer">
        <span>Fusion</span>
        <div>
          <span>Uma experiência Vórtex</span>
          <span>Dados locais de demonstração</span>
        </div>
      </footer>

      <AnimatePresence>
        {selectedGame && (
          <GameDetail key={selectedGame.slug} game={selectedGame} onClose={closeGame} />
        )}
      </AnimatePresence>
    </div>
  );
}
