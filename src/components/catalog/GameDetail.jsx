import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const closeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export function GameDetail({ game, onClose }) {
  const closeRef = useRef(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const platforms = Object.entries(game.platforms ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name === "windows" ? "Windows" : name === "mac" ? "macOS" : "Linux");

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-detail-title"
        initial={{ opacity: 0, y: 30, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.99 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        <button
          ref={closeRef}
          className="game-detail__close"
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          {closeIcon}
        </button>

        <div className={imageFailed ? "game-detail__hero is-image-missing" : "game-detail__hero"}>
          {!imageFailed && game.image && (
            <img src={game.image} alt="" onError={() => setImageFailed(true)} />
          )}
          {(imageFailed || !game.image) && (
            <div className="game-detail__fallback" aria-hidden="true">
              <span>{game.title.slice(0, 1)}</span>
              <small>Fusion</small>
            </div>
          )}
          <div className="game-detail__hero-shade" />
          <div className="game-detail__hero-copy">
            <div className="game-detail__chips">
              {game.localCoop && <span>Coop local</span>}
              {game.year && <span>{game.year}</span>}
              {game.requiredAge > 0 && <span>{game.requiredAge}+</span>}
              {game.genres[0] && <span>{game.genres[0]}</span>}
            </div>
            <h2 id="game-detail-title">{game.title}</h2>
            <p>{game.description}</p>
          </div>
        </div>

        <div className="game-detail__content">
          <div className="game-detail__facts">
            <div>
              <span>Modo</span>
              <strong>{game.players}</strong>
            </div>
            <div>
              <span>Preço</span>
              <strong>{game.price}</strong>
            </div>
            <div>
              <span>Metacritic</span>
              <strong>{game.metacritic ?? "Não informado"}</strong>
            </div>
          </div>

          <div className="game-detail__section">
            <span className="catalog-eyebrow">Informações</span>
            <div className="game-detail__tags">
              {[...game.genres, ...game.tags, ...platforms].slice(0, 12).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>

          {game.about && (
            <div className="game-detail__section">
              <span className="catalog-eyebrow">Sobre o jogo</span>
              <p className="game-detail__about">{game.about}</p>
            </div>
          )}

          <div className="game-detail__section">
            <span className="catalog-eyebrow">Requisitos do sistema</span>
            <div className="game-detail__requirements game-detail__requirements--real">
              <div>
                <span>Mínimos</span>
                <strong>{game.requirements.minimum || "Não informado pela Steam."}</strong>
              </div>
              <div>
                <span>Recomendados</span>
                <strong>{game.requirements.recommended || "Não informado pela Steam."}</strong>
              </div>
            </div>
          </div>

          <div className="game-detail__notice">
            Metadados importados da Steam. O Fusion mantém conteúdo sexual explícito fora
            do catálogo público sem confundir esse filtro com classificação etária por
            violência, terror ou outros temas.
          </div>

          <div className="game-detail__actions">
            {game.storeUrl && (
              <a
                className="game-detail__steam"
                href={game.storeUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ver página oficial na Steam
              </a>
            )}
            <button className="game-detail__download" type="button" disabled>
              Downloads serão configurados em etapa posterior
            </button>
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}
