import React from "react";
import { motion } from "framer-motion";

export function GameCard({ game, onOpen, compact = false }) {
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
      <button
        className="game-card__button"
        type="button"
        onClick={() => onOpen(game)}
        aria-label={`Abrir detalhes de ${game.title}`}
      >
        <div className="game-card__media">
          <img src={game.image} alt="" loading="lazy" />
          <div className="game-card__shade" />
          <div className="game-card__badges">
            {game.localCoop && <span>Coop local</span>}
            <span>{game.year}</span>
          </div>
        </div>

        <div className="game-card__body">
          <div className="game-card__title-row">
            <h3>{game.title}</h3>
            <span className="game-card__size">{game.size}</span>
          </div>

          <p>{game.description}</p>

          <div className="game-card__meta">
            <span>{game.genres[0]}</span>
            <span>{game.players}</span>
          </div>
        </div>
      </button>
    </motion.article>
  );
}
