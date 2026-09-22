import React, { useEffect } from "react";
import { motion } from "framer-motion";

const closeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export function GameDetail({ game, onClose }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <motion.div
      className="game-detail-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.article
        className="game-detail"
        initial={{ opacity: 0, y: 30, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.99 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        <button className="game-detail__close" type="button" onClick={onClose} aria-label="Fechar detalhes">
          {closeIcon}
        </button>

        <div className="game-detail__hero">
          <img src={game.image} alt="" />
          <div className="game-detail__hero-shade" />
          <div className="game-detail__hero-copy">
            <div className="game-detail__chips">
              {game.localCoop && <span>Coop local</span>}
              <span>{game.year}</span>
              <span>{game.genres[0]}</span>
            </div>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
          </div>
        </div>

        <div className="game-detail__content">
          <div className="game-detail__facts">
            <div>
              <span>Jogadores</span>
              <strong>{game.players}</strong>
            </div>
            <div>
              <span>Tamanho</span>
              <strong>{game.size}</strong>
            </div>
            <div>
              <span>Gêneros</span>
              <strong>{game.genres.join(" · ")}</strong>
            </div>
          </div>

          <div className="game-detail__section">
            <span className="catalog-eyebrow">Tags</span>
            <div className="game-detail__tags">
              {game.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>

          <div className="game-detail__section">
            <span className="catalog-eyebrow">Requisitos do sistema</span>
            <div className="game-detail__requirements">
              <div>
                <span>Sistema</span>
                <strong>Windows 10/11 64-bit</strong>
              </div>
              <div>
                <span>Memória</span>
                <strong>Dados oficiais entram depois</strong>
              </div>
              <div>
                <span>GPU / CPU</span>
                <strong>Importados da fonte oficial</strong>
              </div>
            </div>
          </div>

          <div className="game-detail__notice">
            Estes dados são temporários e servem apenas para validar a interface.
            Tamanho, requisitos e demais informações serão substituídos pelos dados oficiais
            quando conectarmos a camada Steam.
          </div>

          <button className="game-detail__download" type="button" disabled>
            Download será conectado em uma etapa posterior
          </button>
        </div>
      </motion.article>
    </motion.div>
  );
}
