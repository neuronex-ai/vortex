import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../../lib/supabase.js";
import { authHref, safeAppReturn } from "../../content/navigation.mjs";
import "../../styles/auth.css";
import "../../styles/welcome.css";

const steps = [
  { label: "Seu ponto de partida", title: "Bem-vindo ao Fusion.", body: "Seu próximo jogo pode estar a uma descoberta daqui. Explore títulos de PC e combine os filtros do catálogo para encontrar o que combina com você.", image: "A" },
  { label: "Uma lista com a sua cara", title: "Gostou? Guarde para depois.", body: "Toque no coração de um jogo para salvá-lo. Sua lista fica em Favoritos e acompanha você quando entra com a mesma conta em outro dispositivo.", image: "C" },
  { label: "Tudo por perto", title: "Explore. E sinta-se em casa.", body: "Catálogo, Favoritos e Minha conta ficam no menu do aplicativo. Para acessar guias, ajuda e novidades, escolha Voltar ao site.", image: "G" },
];
function WelcomeScreen() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const heading = useRef(null);
  const next = safeAppReturn(new URLSearchParams(window.location.search).get("next") || "/app/");
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (!data.user) { setStatus(authError && authError.name !== "AuthSessionMissingError" ? "error" : "guest"); return; }
      if (data.user.user_metadata?.fusion_welcome_completed) { window.location.replace(next); return; }
      setStatus("ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [next]);
  useEffect(() => { if (status === "ready" && step > 0) heading.current?.focus(); }, [step, status]);
  async function finish() {
    setStatus("saving"); setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ data: { fusion_welcome_completed: true } });
      if (updateError) throw updateError;
      window.location.assign(next);
    } catch { setError("Não conseguimos salvar que você concluiu o tour. Tente novamente ou continue para o catálogo."); setStatus("ready"); }
  }
  if (status === "loading") return <main className="auth-page"><p role="status">Preparando suas boas-vindas…</p></main>;
  if (status === "guest" || status === "error") return <main className="auth-page"><section className="auth-card"><h1>{status === "guest" ? "Seu espaço começa aqui." : "Não conseguimos verificar seu acesso."}</h1><p>{status === "guest" ? "Entre na sua conta para conhecer os primeiros passos." : "Confira sua conexão e tente novamente."}</p><a className="auth-primary" href={authHref("sign-in", next) + "&onboarding=1"}>Entrar no Fusion</a><a className="auth-back" href="/app/">Explorar catálogo</a></section></main>;
  const current = steps[step];
  return <main className="fusion-welcome"><section className="fusion-welcome-card" aria-labelledby="welcome-title">
    <div className="fusion-welcome-art"><img src={`/assets/fusion/${current.image}.png`} alt="" width="1536" height="1024" /></div>
    <div className="fusion-welcome-copy">
      <p className="auth-eyebrow">{current.label}</p><h1 id="welcome-title" tabIndex="-1" ref={heading}>{current.title}</h1><p>{current.body}</p>
      <ol className="fusion-welcome-progress" aria-label="Etapas das boas-vindas">{steps.map((item, i) => <li key={item.label} aria-current={i === step ? "step" : undefined}><span className="sr-only">Etapa {i + 1}: {item.label}</span></li>)}</ol>
      <span className="fusion-welcome-count" role="status">{step + 1} de {steps.length}</span>
      {error && <p role="alert" className="auth-feedback auth-feedback--error">{error} <a href={next}>Continuar</a></p>}
      <div className="fusion-welcome-controls">{step > 0 && <button type="button" className="auth-text-button" onClick={() => setStep(step - 1)} disabled={status === "saving"}>Voltar</button>}<button className="auth-primary" type="button" disabled={status === "saving"} onClick={() => step === 2 ? finish() : setStep(step + 1)}>{status === "saving" ? "Salvando…" : step === 2 ? "Explorar meu catálogo" : "Continuar"}</button></div>
      {step < 2 && <button type="button" className="auth-text-button" onClick={finish} disabled={status === "saving"}>Pular apresentação</button>}
    </div>
  </section></main>;
}
let welcomeRoot;
export function mountWelcomePage() { const node = document.getElementById("fusion-app-root"); if (node) { welcomeRoot ||= createRoot(node); welcomeRoot.render(<WelcomeScreen />); } }
