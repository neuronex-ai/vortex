import React, { useState } from "react";
import { motion } from "framer-motion";

export function GameCard({ game, onOpen, onToggleFavorite, isFavorite = false, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <motion.article
      className={compact ? "game-card game-card--compact" : "game-card"}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.22 }}
    >
      <button className="game-card__button" type="button" onClick={() => onOpen(game)} aria-label={`Abrir detalhes de ${game.title}`}>
        <div className={imageFailed ? "game-card__media is-image-missing" : "game-card__media"}>
          {!imageFailed && game.image && (
            <img
              src={game.image}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          )}
          {(imageFailed || !game.image) && (
            <div className="game-card__fallback" aria-hidden="true">
              <span>{game.title.slice(0, 1)}</span>
              <small>Fusion</small>
            </div>
          )}
          <div className="game-card__shade" />
          <div className="game-card__badges">
            {game.localCoop && <span>Coop local</span>}
            <span>{game.year || "Steam"}</span>
            <span>{game.hasSource ? "Fonte disponível" : "Sem fonte externa"}</span>
          </div>
        </div>

        <div className="game-card__body">
          <div className="game-card__title-row">
            <h3>{game.title}</h3>
            <span className="game-card__size">{game.price}</span>
          </div>

          <p>{game.description}</p>

          <div className="game-card__meta">
            <span>{game.genres[0] || "Jogo"}</span>
            <span>{game.players}</span>
          </div>
        </div>
      </button>
      <button
        className={isFavorite ? "game-card__favorite is-favorite" : "game-card__favorite"}
        type="button"
        onClick={() => onToggleFavorite(game)}
        aria-label={isFavorite ? `Remover ${game.title} dos favoritos` : `Adicionar ${game.title} aos favoritos`}
        aria-pressed={isFavorite}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 4.9 14a5.1 5.1 0 0 1 7.1-7.3L12 6.8l.1-.1a5.1 5.1 0 0 1 7.1 7.3Z" /></svg>
      </button>
    </motion.article>
  );
}
