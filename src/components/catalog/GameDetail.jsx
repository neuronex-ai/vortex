import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchDistributionSources,
  hydrateGameDetails,
} from "../../services/gameCatalog.js";
import "../../styles/game-detail-v2.css";

const closeIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

function sourceActionLabel(source) {
  if (source.direct) return `Baixar em ${source.providerName}`;
  if (source.kind === "official_demo") return `Abrir demo em ${source.providerName}`;
  return `Abrir ${source.providerName}`;
}

function AboutContent({ text }) {
  const blocks = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="game-detail-v2__prose">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const bullets = lines.filter((line) => line.startsWith("•"));

        if (bullets.length === lines.length && bullets.length) {
          return (
            <ul key={index}>
              {bullets.map((line, itemIndex) => (
                <li key={itemIndex}>{line.replace(/^•\s*/, "")}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{block.replace(/\n/g, " ")}</p>;
      })}
    </div>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="game-detail-v2__fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function GameDetail({
  game,
  onClose,
  isFavorite = false,
  onToggleFavorite,
}) {
  const closeRef = useRef(null);
  const [detailGame, setDetailGame] = useState(game);
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [hydrating, setHydrating] = useState(true);

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

  useEffect(() => {
    let active = true;
    setHydrating(true);

    hydrateGameDetails(game)
      .then((nextGame) => {
        if (active && nextGame) setDetailGame(nextGame);
      })
      .finally(() => {
        if (active) setHydrating(false);
      });

    return () => {
      active = false;
    };
  }, [game]);

  useEffect(() => {
    let active = true;
    setSourcesLoading(true);

    fetchDistributionSources(detailGame.id)
      .then((items) => {
        if (active) setSources(items);
      })
      .catch(() => {
        if (active) setSources([]);
      })
      .finally(() => {
        if (active) setSourcesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailGame.id]);

  const platforms = Object.entries(detailGame.platforms ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) =>
      name === "windows" ? "Windows" : name === "mac" ? "macOS" : "Linux",
    );

  const gallery = useMemo(() => {
    const values = detailGame.gallery?.length
      ? detailGame.gallery
      : [detailGame.image, detailGame.backgroundImage].filter(Boolean);
    return values.slice(0, 10);
  }, [detailGame]);

  useEffect(() => {
    setActiveImage(0);
  }, [detailGame.id]);

  const currentImage = gallery[activeImage] || detailGame.image;
  const developer = detailGame.developers?.join(", ");
  const publisher = detailGame.publishers?.join(", ");

  return (
    <motion.div
      className="game-detail-v2-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.article
        className="game-detail-v2"
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
          className="game-detail-v2__close"
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          {closeIcon}
        </button>

        <div className="game-detail-v2__layout">
          <section className="game-detail-v2__media">
            <div className="game-detail-v2__stage">
              <AnimatePresence mode="wait">
                {currentImage ? (
                  <motion.img
                    key={currentImage}
                    src={currentImage}
                    alt=""
                    initial={{ opacity: 0.45, scale: 1.015 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  />
                ) : (
                  <div className="game-detail-v2__fallback">{detailGame.title.slice(0, 1)}</div>
                )}
              </AnimatePresence>
              <div className="game-detail-v2__stage-shade" />
              {hydrating && <span className="game-detail-v2__syncing">Atualizando dados da Steam…</span>}
            </div>

            {gallery.length > 1 && (
              <div className="game-detail-v2__thumbs" aria-label="Galeria do jogo">
                {gallery.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    className={index === activeImage ? "is-active" : undefined}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Ver imagem ${index + 1}`}
                  >
                    <img src={image} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="game-detail-v2__summary">
            <div className="game-detail-v2__chips">
              {detailGame.localCoop && <span>Coop local</span>}
              {detailGame.splitScreen && <span>Tela dividida</span>}
              {detailGame.year && <span>{detailGame.year}</span>}
              {detailGame.requiredAge > 0 && <span>{detailGame.requiredAge}+</span>}
            </div>

            <span className="game-detail-v2__eyebrow">Steam · PC</span>
            <h2 id="game-detail-title">{detailGame.title}</h2>
            <p className="game-detail-v2__lede">{detailGame.description}</p>

            <div className="game-detail-v2__primary-actions">
              {onToggleFavorite && (
                <button
                  type="button"
                  className={isFavorite ? "is-favorite" : undefined}
                  onClick={() => onToggleFavorite(detailGame)}
                >
                  {isFavorite ? "♥ Salvo nos favoritos" : "♡ Adicionar aos favoritos"}
                </button>
              )}
              {detailGame.storeUrl && (
                <a href={detailGame.storeUrl} target="_blank" rel="noreferrer">
                  Ver na Steam ↗
                </a>
              )}
            </div>

            <div className="game-detail-v2__fact-grid">
              <Fact label="Preço" value={detailGame.price} />
              <Fact label="Modo" value={detailGame.players} />
              <Fact label="Metacritic" value={detailGame.metacritic ?? "—"} />
              <Fact label="Controle" value={detailGame.controllerSupport || "Não informado"} />
            </div>
          </section>
        </div>

        <div className="game-detail-v2__body">
          <main className="game-detail-v2__main">
            {detailGame.about && (
              <section className="game-detail-v2__panel">
                <div className="game-detail-v2__section-heading">
                  <span>Visão geral</span>
                  <h3>Sobre o jogo</h3>
                </div>
                <AboutContent text={detailGame.about} />
              </section>
            )}

            <section className="game-detail-v2__panel">
              <div className="game-detail-v2__section-heading">
                <span>Recursos</span>
                <h3>Como você pode jogar</h3>
              </div>
              <div className="game-detail-v2__tag-cloud">
                {[...detailGame.genres, ...detailGame.categories, ...platforms]
                  .filter(Boolean)
                  .slice(0, 18)
                  .map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </section>

            <section className="game-detail-v2__panel">
              <div className="game-detail-v2__section-heading">
                <span>PC</span>
                <h3>Requisitos do sistema</h3>
              </div>
              <div className="game-detail-v2__requirements">
                <div>
                  <span>Mínimos</span>
                  <p>{detailGame.requirements.minimum || "Não informado pela Steam."}</p>
                </div>
                <div>
                  <span>Recomendados</span>
                  <p>{detailGame.requirements.recommended || "Não informado pela Steam."}</p>
                </div>
              </div>
            </section>
          </main>

          <aside className="game-detail-v2__aside">
            <section className="game-detail-v2__panel game-detail-v2__panel--compact">
              <div className="game-detail-v2__section-heading">
                <span>Ficha técnica</span>
                <h3>Detalhes</h3>
              </div>
              <dl className="game-detail-v2__meta-list">
                <div><dt>Desenvolvedor</dt><dd>{developer || "Não informado"}</dd></div>
                <div><dt>Publicadora</dt><dd>{publisher || "Não informado"}</dd></div>
                <div><dt>Lançamento</dt><dd>{detailGame.year || "Não informado"}</dd></div>
                <div><dt>Plataformas</dt><dd>{platforms.join(", ") || "PC"}</dd></div>
                <div><dt>Recomendações</dt><dd>{detailGame.recommendations?.toLocaleString("pt-BR") || "—"}</dd></div>
              </dl>
              {detailGame.website && (
                <a className="game-detail-v2__text-link" href={detailGame.website} target="_blank" rel="noreferrer">
                  Site oficial ↗
                </a>
              )}
            </section>

            <section className="game-detail-v2__panel game-detail-v2__panel--compact">
              <div className="game-detail-v2__section-heading">
                <span>Disponibilidade</span>
                <h3>Onde obter</h3>
              </div>

              {sourcesLoading ? (
                <div className="game-detail-v2__muted">Consultando fontes…</div>
              ) : sources.length ? (
                <div className="game-detail-v2__sources">
                  {sources.map((source) => {
                    const url = source.downloadUrl || source.landingUrl;
                    return (
                      <a key={source.id} href={url} target="_blank" rel="noreferrer">
                        <span>
                          <strong>{source.providerName}</strong>
                          <small>{source.direct ? "Download autorizado" : "Fonte oficial"}</small>
                        </span>
                        <b>{sourceActionLabel(source)} →</b>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="game-detail-v2__muted">Nenhuma fonte disponível.</div>
              )}
            </section>

            <div className="game-detail-v2__safety">
              O Fusion usa os metadados oficiais da Steam e oculta do catálogo público
              títulos identificados com conteúdo sexual/adulto explícito.
            </div>
          </aside>
        </div>
      </motion.article>
    </motion.div>
  );
}
