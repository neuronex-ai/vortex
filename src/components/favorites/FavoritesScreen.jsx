import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "../../lib/supabase.js";
import {
  fetchFavoritePage,
  removeFavorite,
  PAGE_SIZE,
} from "../../services/gameCatalog.js";
import { GameCard } from "../catalog/GameCard.jsx";
import { GameDetail } from "../catalog/GameDetail.jsx";
import "../../styles/catalog.css";
import "../../styles/app-pages.css";

export function FavoritesScreen() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [games, setGames] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [error, setError] = useState("");

  async function load(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchFavoritePage({ page: nextPage, limit: PAGE_SIZE });
      setGames(result.games);
      setCount(result.count);
    } catch (loadError) {
      setError(loadError?.message || "Não foi possível carregar seus favoritos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error: sessionError }) => {
      if (!active) return;
      setAuthLoading(false);
      if (sessionError && sessionError.name !== "AuthSessionMissingError") setAuthError("Não foi possível verificar sua conta. Tente novamente.");
      setUser(data.user ?? null);
    }).catch(() => { if (active) { setAuthLoading(false); setAuthError("Não foi possível verificar sua conta. Tente novamente."); } });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setAuthLoading(false); setAuthError(""); }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setCount(0);
      setLoading(false);
      return;
    }
    load(page);
  }, [user, page]);

  async function remove(game) {
    const previous = games;
    setGames((items) => items.filter((item) => item.id !== game.id));
    setCount((value) => Math.max(0, value - 1));

    try {
      await removeFavorite(game.id);
      if (previous.length === 1 && page > 1) setPage((value) => value - 1);
    } catch {
      setGames(previous);
      setCount((value) => value + 1);
      setError("Não foi possível remover esse favorito.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  if (authLoading) return <main className="fusion-page-shell"><p className="fusion-route-loading" role="status">Verificando seu acesso…</p></main>;
  if (authError) return <main className="fusion-page-shell"><section className="fusion-account-empty"><h1>Vamos tentar de novo?</h1><p role="alert">{authError}</p><button className="fusion-page-primary" onClick={() => window.location.reload()}>Tentar novamente</button><a className="auth-back" href="/app/">Explorar catálogo</a></section></main>;
  if (!user) {
    return (
      <main className="fusion-page-shell">
        <section className="fusion-account-empty">
          <span className="fusion-page-eyebrow">Favoritos</span>
          <h1>Sua lista acompanha sua conta.</h1>
          <p>Entre para salvar jogos e organizar o que quer jogar depois.</p>
          <a className="fusion-page-primary" href="/app/auth.html?next=/app/favorites.html">Entrar no Fusion</a>
        </section>
      </main>
    );
  }

  return (
    <main className="fusion-page-shell">

      <section className="fusion-page-hero fusion-page-hero--compact">
        <span className="fusion-page-eyebrow">Sua biblioteca</span>
        <h1>Favoritos.</h1>
        <p>{count ? `${count} jogo(s) salvos para consultar depois.` : "Quando você salvar um jogo, ele aparece aqui."}</p>
      </section>

      <section className="fusion-favorites-panel">
        {error && <div className="fusion-inline-error">{error}</div>}

        {loading ? (
          <div className="game-grid">
            {Array.from({ length: 6 }).map((_, index) => <div className="game-skeleton" key={index} />)}
          </div>
        ) : games.length ? (
          <>
            <motion.div className="game-grid" layout>
              <AnimatePresence mode="popLayout">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onOpen={setSelectedGame}
                    onToggleFavorite={remove}
                    isFavorite
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            <div className="catalog-pagination">
              <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>← Anterior</button>
              <span>Página {page} de {totalPages} · máximo de {PAGE_SIZE} jogos</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima →</button>
            </div>
          </>
        ) : (
          <div className="fusion-empty-state">
            <span>♡</span>
            <h2>Nenhum favorito ainda.</h2>
            <p>Explore o catálogo e use o coração para guardar jogos.</p>
            <a href="/app/">Explorar catálogo</a>
          </div>
        )}
      </section>

      <AnimatePresence>
        {selectedGame && (
          <GameDetail
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
            isFavorite
            onToggleFavorite={remove}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
