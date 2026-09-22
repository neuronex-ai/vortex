import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getFusioAIUser,
  onFusioAIAuthChange,
  sendFusioAIMessage,
} from "../../services/fusioAI.js";
import "../../styles/fusio-ai.css";

const MicIcon = ({ active = false }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    {active ? <circle cx="19" cy="5" r="2" className="fusio-ai__icon-dot" /> : null}
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 5.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);

const suggestions = [
  "Liste 10 jogos como Resident Evil 5 para jogar localmente, com Nucleus ou tela dividida nativa.",
  "Quais jogos de terror com coop local têm fonte externa disponível?",
  "Me indique jogos de aventura para dois controles sem precisar do Nucleus.",
];

function LinkifiedText({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s)\]}>,]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//i.test(part) ? (
          <a key={index} href={part} target="_blank" rel="noreferrer noopener">
            {part}
          </a>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function speechText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#|>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2800);
}

export function FusioAI() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState("");
  const viewportRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const sendRef = useRef(null);

  const speechSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  );

  useEffect(() => {
    let active = true;
    getFusioAIUser().then((next) => {
      if (active) setUser(next);
    });
    const unsubscribe = onFusioAIAuthChange((next) => {
      setUser(next);
      if (!next) setMessages([]);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!viewportRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, activity]);

  const stopAudio = useCallback(() => {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setListening(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const speak = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const clean = speechText(text);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "pt-BR";
    utterance.rate = 0.98;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendMessage = useCallback(
    async (rawText, speakReply = false) => {
      const text = String(rawText ?? "").trim();
      if (!text || sending || !user) return;

      const userMessage = {
        id: "user-" + Date.now(),
        role: "user",
        content: text,
      };
      const history = [...messages, userMessage].slice(-16);

      setMessages((current) => [...current, userMessage].slice(-40));
      setDraft("");
      setError("");
      setSending(true);
      setActivity("Consultando o catálogo…");

      try {
        const result = await sendFusioAIMessage(history);
        const assistantMessage = {
          id: "assistant-" + Date.now(),
          role: "assistant",
          content: result.reply,
        };
        setMessages((current) => [...current, assistantMessage].slice(-40));
        if (speakReply || voiceMode) speak(result.reply);
      } catch (requestError) {
        const code = requestError?.message;
        if (code === "AUTH_REQUIRED") {
          setUser(null);
          setError("Entre na sua conta Fusion para usar o Fusio AI.");
        } else if (code === "FUSIO_NOT_CONFIGURED") {
          setError("O Fusio AI ainda está aguardando a chave NVIDIA no servidor.");
        } else {
          setError("Não foi possível consultar o Fusio AI agora. Tente novamente.");
        }
      } finally {
        setSending(false);
        setActivity("");
      }
    },
    [messages, sending, speak, user, voiceMode],
  );

  sendRef.current = sendMessage;

  const startListening = useCallback(
    (autoSend = false) => {
      setOpen(true);
      setVoiceMode(autoSend);
      setError("");

      if (!user) return;

      if (!speechSupported) {
        setError("O reconhecimento de voz não está disponível neste navegador.");
        return;
      }

      recognitionRef.current?.stop?.();

      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => setListening(true);
      recognition.onerror = () => {
        setListening(false);
        setError("Não consegui ouvir o microfone. Verifique a permissão do navegador.");
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognition.onresult = (event) => {
        let transcript = "";
        let finalText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const piece = event.results[index][0]?.transcript || "";
          transcript += piece;
          if (event.results[index].isFinal) finalText += piece;
        }
        if (transcript.trim()) setDraft(transcript.trim());
        if (finalText.trim() && autoSend) {
          window.setTimeout(() => sendRef.current?.(finalText.trim(), true), 80);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [speechSupported, user],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const clearConversation = () => {
    stopAudio();
    setMessages([]);
    setDraft("");
    setError("");
    setActivity("");
    setVoiceMode(false);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        startListening(true);
        return;
      }
      if (event.key === "Escape" && open) {
        stopAudio();
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, startListening, stopAudio]);

  const submit = (event) => {
    event?.preventDefault?.();
    void sendMessage(draft, false);
  };

  return (
    <div className="fusio-ai" data-open={open ? "true" : "false"}>
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.div
            key="launcher"
            className="fusio-ai__launcher"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 390, damping: 36, mass: 0.74 }}
            role="toolbar"
            aria-label="Conversar com o Fusio AI"
          >
            <motion.button
              type="button"
              onClick={() => startListening(true)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              aria-label="Conversar por voz com o Fusio AI"
              title="Voz · Ctrl/⌘ + Shift + Espaço"
            >
              <MicIcon active={listening} />
            </motion.button>
            <span aria-hidden="true" />
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              aria-label="Abrir Fusio AI"
              title="Texto · Ctrl/⌘ + K"
            >
              <ChatIcon />
            </motion.button>
          </motion.div>
        ) : (
          <motion.aside
            key="panel"
            className="fusio-ai__panel"
            initial={{ opacity: 0, x: 12, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, y: 5, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 410, damping: 40, mass: 0.78 }}
            aria-label="Fusio AI"
          >
            <header className="fusio-ai__header">
              <button
                type="button"
                className="fusio-ai__identity"
                onClick={() => inputRef.current?.focus()}
              >
                <span className="fusio-ai__wordmark">Fusio AI</span>
                <small>Fusion · Steam · jogo local</small>
              </button>

              <div className="fusio-ai__header-actions">
                <button type="button" onClick={clearConversation} aria-label="Nova conversa" title="Nova conversa">
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    setOpen(false);
                  }}
                  aria-label="Recolher Fusio AI"
                  title="Recolher"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>

            <div ref={viewportRef} className="fusio-ai__viewport">
              {!messages.length ? (
                <div className="fusio-ai__empty">
                  <div>
                    <h2>Como posso ajudar?</h2>
                    <p>
                      Pergunte sobre jogos, coop local, Nucleus, detalhes da Steam e
                      fontes já disponíveis no Fusion.
                    </p>
                  </div>

                  <div className="fusio-ai__suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          if (!user) return;
                          void sendMessage(suggestion);
                        }}
                        disabled={!user || sending}
                      >
                        {suggestion}
                        <span>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="fusio-ai__messages" role="log" aria-live="polite">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={message.role === "user" ? "is-user" : "is-assistant"}
                    >
                      <div>
                        {message.role === "assistant" ? (
                          <LinkifiedText text={message.content} />
                        ) : (
                          message.content
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {(sending || activity) ? (
                <div className="fusio-ai__thinking" role="status">
                  <span />
                  <span>{activity || "Pensando…"}</span>
                </div>
              ) : null}

              {error ? <p className="fusio-ai__error" role="alert">{error}</p> : null}
            </div>

            {user === null ? (
              <div className="fusio-ai__signin">
                <div>
                  <strong>Entre para conversar</strong>
                  <span>A conexão com a NVIDIA fica protegida no servidor.</span>
                </div>
                <a href="/app/auth.html?next=/app/">Entrar</a>
              </div>
            ) : (
              <form className="fusio-ai__composer-wrap" onSubmit={submit}>
                <div className="fusio-ai__context-line">
                  <span />
                  <small>
                    {listening ? "Ouvindo você…" : voiceMode ? "Modo voz" : "Contexto do catálogo Fusion"}
                  </small>
                </div>

                <div className="fusio-ai__composer">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        submit(event);
                      }
                    }}
                    placeholder="Pergunte ao Fusio AI..."
                    rows={1}
                    maxLength={6000}
                    disabled={!user || sending}
                    aria-label="Mensagem para o Fusio AI"
                  />

                  <div className="fusio-ai__composer-actions">
                    <motion.button
                      type="button"
                      onClick={() => listening ? stopListening() : startListening(false)}
                      whileTap={{ scale: 0.92 }}
                      className={listening ? "is-active" : undefined}
                      aria-label={listening ? "Parar de ouvir" : "Usar microfone"}
                      disabled={!user || sending}
                    >
                      {listening ? <StopIcon /> : <MicIcon />}
                    </motion.button>

                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.92 }}
                      className={draft.trim() && !sending ? "is-send" : undefined}
                      disabled={!user || sending || !draft.trim()}
                      aria-label="Enviar mensagem"
                    >
                      <SendIcon />
                    </motion.button>
                  </div>
                </div>
              </form>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
