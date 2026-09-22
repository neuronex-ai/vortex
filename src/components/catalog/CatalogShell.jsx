import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  addFavorite,
  fetchFavoriteGames,
  fetchFeaturedCoop,
  fetchGameBySlug,
  fetchGamePage,
  PAGE_SIZE,
  removeFavorite,
} from "../../services/gameCatalog.js";
import { supabase } from "../../lib/supabase.js";
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

const filters = ["Todos", "Com fontes", "Coop local", "Ação", "Aventura", "Indie", "RPG"];
const categories = [
  "Coop local",
  "Ação",
  "Aventura",
  "Terror",
  "Casual",
  "Indie",
  "RPG",
  "Estratégia",
];

const ease = [0.22, 1, 0.36, 1];

export function CatalogShell() {
  const [activeNav, setActiveNav] = useState("Explorar");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [sort, setSort] = useState("popular");
  const [games, setGames] = useState([]);
  const [coopGames, setCoopGames] = useState([]);
  const [favoriteGames, setFavoriteGames] = useState([]);
  const [user, setUser] = useState(null);
  const [favoriteError, setFavoriteError] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [steamSearchUnavailable, setSteamSearchUnavailable] = useState(false);
  const [metadataUnavailable, setMetadataUnavailable] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState([null]);

  const currentCursor = cursorStack[page - 1] ?? null;

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setLoading(true);
      setCatalogError("");

      try {
        const result = await fetchGamePage({
          query,
          filter: activeFilter,
          sort,
          cursor: currentCursor,
          limit: PAGE_SIZE,
        });

        if (!active) return;
        setGames(result.games);
        setHasMore(result.hasMore);
        setMetadataUnavailable(result.metadataUnavailable ?? false);
        setSteamSearchUnavailable(result.steamSearchUnavailable ?? false);
      } catch (error) {
        if (!active) return;
        setGames([]);
        setHasMore(false);
        setMetadataUnavailable(false);
        setCatalogError(error?.message || "Não foi possível carregar o catálogo.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCatalog();
    return () => {
      active = false;
    };
  }, [activeFilter, currentCursor, page, query, sort, searchAttempt]);

  useEffect(() => {
    let active = true;
    fetchFeaturedCoop()
      .then((items) => {
        if (active) setCoopGames(items);
      })
      .catch(() => {
        if (active) setCoopGames([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const { data } = await supabase.auth.getUser();
      if (active) setUser(data.user ?? null);
    }

    loadAccount();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const authStatus = url.searchParams.get("auth");
    const signedOut = url.searchParams.get("signed_out");

    if (authStatus === "success") setAuthNotice("Login concluído. Sua conta Fusion está conectada.");
    if (signedOut === "1") setAuthNotice("Você saiu da sua conta.");

    if (authStatus || signedOut) {
      url.searchParams.delete("auth");
      url.searchParams.delete("signed_out");
      window.history.replaceState({}, "", url);
      const timeout = window.setTimeout(() => setAuthNotice(""), 4200);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, []);

  useEffect(() => {
    let active = true;
    setFavoriteError("");

    if (!user) {
      setFavoriteGames([]);
      return () => { active = false; };
    }

    fetchFavoriteGames()
      .then((items) => { if (active) setFavoriteGames(items); })
      .catch(() => { if (active) setFavoriteError("Não foi possível carregar seus favoritos agora."); });

    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const openFromUrl = async () => {
      const slug = new URLSearchParams(window.location.search).get("game");
      if (!slug) {
        setSelectedGame(null);
        return;
      }

      try {
        const game = await fetchGameBySlug(slug);
        setSelectedGame(game);
      } catch {
        setSelectedGame(null);
      }
    };

    openFromUrl();
    window.addEventListener("popstate", openFromUrl);
    return () => window.removeEventListener("popstate", openFromUrl);
  }, []);

  function resetPagination() {
    setPage(1);
    setCursorStack([null]);
  }

  function openGame(game) {
    const url = new URL(window.location.href);
    url.searchParams.set("game", game.slug);
    window.history.pushState({}, "", url);
    setSelectedGame(game);
  }

  async function toggleFavorite(game) {
    if (!user) {
      window.location.assign("/app/auth.html?next=/app/");
      return;
    }

    const isFavorite = favoriteGames.some((item) => item.id === game.id);
    setFavoriteError("");
    setFavoriteGames((items) => isFavorite ? items.filter((item) => item.id !== game.id) : [game, ...items]);

    try {
      if (isFavorite) await removeFavorite(game.id);
      else await addFavorite(game.id);
    } catch (error) {
      setFavoriteGames((items) => isFavorite ? [game, ...items] : items.filter((item) => item.id !== game.id));
      setFavoriteError(error?.message || "Não foi possível atualizar seus favoritos. Tente novamente.");
    }
  }

  function closeGame() {
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    window.history.pushState({}, "", url);
    setSelectedGame(null);
  }

  function submitSearch(event) {
    event.preventDefault();
    setQuery(draftQuery.trim());
    setSearchAttempt(value => value + 1);
    resetPagination();
    document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectFilter(filter) {
    setActiveFilter(filter);
    resetPagination();
    document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" });
  }

  function changeSort(event) {
    setSort(event.target.value);
    resetPagination();
  }

  function goNext() {
    if (!hasMore || !games.length) return;
    const nextCursor = games.at(-1)?.cursor;
    if (!nextCursor) return;

    setCursorStack((current) => {
      const next = current.slice(0, page);
      next[page] = nextCursor;
      return next;
    });
    setPage((value) => value + 1);
    document.getElementById("explorar")?.scrollIntoView({ behavior: "smooth" });
  }

  function goPrevious() {
    if (page <= 1) return;
    setPage((value) => value - 1);
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
          href={user ? "/app/account.html" : "/app/auth.html?next=/app/"}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <span>{user ? "Minha conta" : "Entrar"}</span>
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
              {user && <a href="/app/favorites.html"><span>Favoritos</span>{arrowIcon}</a>}
              <a href={user ? "/app/account.html" : "/app/auth.html?next=/app/"}>
                <span>{user ? "Minha conta" : "Entrar"}</span>
                {arrowIcon}
              </a>
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
          Explore a seleção family-friendly do Fusion, com detalhes da Steam
          e referências externas para consultar mais informações sobre cada jogo.
        </p>

        <motion.form className="catalog-search" onSubmit={submitSearch}>
          <span className="catalog-search__icon">{searchIcon}</span>
          <input
            type="search"
            maxLength={80}
            name="query"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
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
          {loading
            ? "Consultando o catálogo..."
            : query
              ? `Exibindo ${games.length} jogo(s) nesta página para “${query}”.`
              : "Seleção family-friendly · Detalhes da Steam e referências externas."}
        </div>

        {steamSearchUnavailable && <p role="status">A busca na Steam está indisponível agora. Tente pesquisar novamente em instantes.</p>}
        {metadataUnavailable && <p role="status">Alguns detalhes da Steam estão indisponíveis. Exibindo as informações salvas no catálogo.</p>}
        {favoriteError && <p role="alert">{favoriteError}</p>}

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
            <span className="catalog-status">
              Página {page} · {games.length}/{PAGE_SIZE}
            </span>
            <label className="catalog-sort">
              <span>Ordenar</span>
              <select value={sort} onChange={changeSort}>
                <option value="popular">Populares</option>
                <option value="recentes">Mais recentes</option>
                <option value="nome">Nome A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {catalogError ? (
          <div className="catalog-empty">
            <div className="catalog-empty__icon">{gridIcon}</div>
            <h3>Não foi possível carregar os jogos.</h3>
            <p>{catalogError}</p>
          </div>
        ) : loading ? (
          <div className="game-grid" aria-label="Carregando jogos">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="game-skeleton" key={index} />
            ))}
          </div>
        ) : games.length ? (
          <>
            <motion.div className="game-grid" layout>
              <AnimatePresence mode="popLayout">
                {games.map((game) => (
                  <GameCard key={game.id} game={game} onOpen={openGame} onToggleFavorite={toggleFavorite} isFavorite={favoriteGames.some((item) => item.id === game.id)} />
                ))}
              </AnimatePresence>
            </motion.div>

            <div className="catalog-pagination" aria-label="Paginação do catálogo">
              <button type="button" onClick={goPrevious} disabled={page === 1}>
                ← Anterior
              </button>
              <span>Página {page} · máximo de {PAGE_SIZE} jogos</span>
              <button type="button" onClick={goNext} disabled={!hasMore}>
                Próxima →
              </button>
            </div>
          </>
        ) : (
          <motion.div className="catalog-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="catalog-empty__icon">{gridIcon}</div>
            <h3>Nenhum jogo encontrado.</h3>
            <p>Tente outro termo ou volte para “Todos”.</p>
          </motion.div>
        )}
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
            <p>Jogos da seleção com coop local informado pela Steam.</p>
          </div>
          <button type="button" onClick={() => selectFilter("Coop local")}>Ver todos</button>
        </div>

        <div className="game-grid game-grid--compact">
          {!coopGames.length && <p>Nenhum jogo com coop local disponível nesta seleção.</p>}
          {coopGames.map((game) => (
            <GameCard key={game.id} game={game} onOpen={openGame} onToggleFavorite={toggleFavorite} isFavorite={favoriteGames.some((item) => item.id === game.id)} compact />
          ))}
        </div>
      </motion.section>

      {user && (
        <motion.section className="catalog-secondary-section" aria-labelledby="favorites-heading" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.45, ease }}>
          <div className="catalog-section-heading">
            <div>
              <span className="catalog-eyebrow">Sua biblioteca</span>
              <h2 id="favorites-heading">Favoritos</h2>
              <p>{favoriteError || (favoriteGames.length ? "Jogos que você guardou para jogar depois." : "Marque o coração de um jogo para ele aparecer aqui.")}</p>
            </div>
            <a className="catalog-section-link" href="/app/favorites.html">Gerenciar favoritos →</a>
          </div>
          {favoriteGames.length > 0 && <div className="game-grid game-grid--compact">{favoriteGames.map((game) => <GameCard key={game.id} game={game} onOpen={openGame} onToggleFavorite={toggleFavorite} isFavorite compact />)}</div>}
        </motion.section>
      )}

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
        <p>Explore os jogos da seleção por gênero.</p>

        <div className="category-grid">
          {categories.map((category) => (
            <motion.button
              type="button"
              key={category}
              onClick={() => selectFilter(category)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
            >
              <span>{category}</span>
              <strong>Explorar</strong>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <footer className="catalog-footer">
        <span>Fusion</span>
        <div>
          <span>Uma experiência Vórtex</span>
          <span>Metadados: Steam</span>
          <a href="/politica-de-privacidade">Privacidade</a>
          <a href="/termos-de-uso">Termos</a>
        </div>
      </footer>

      <AnimatePresence>
        {authNotice && (
          <motion.div
            className="catalog-auth-toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            {authNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedGame && (
          <GameDetail
            key={selectedGame.slug}
            game={selectedGame}
            onClose={closeGame}
            isFavorite={favoriteGames.some((item) => item.id === selectedGame.id)}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
