import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { safeAppReturn, signedInDestination } from "../../content/navigation.mjs";

function safeReturnPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return safeAppReturn(next || "/app/");
}

function withAuthSuccess(path) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("auth", "success");
  return `${url.pathname}${url.search}${url.hash}`;
}

function displayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "sua conta";
}

export function AuthScreen() {
  const returnPath = useMemo(safeReturnPath, []);
  const callbackFlow = useMemo(
    () => new URLSearchParams(window.location.search).get("auth_callback") === "1",
    [],
  );
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get("mode") === "create" ? "create" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setCheckingSession(false);
    }).catch(() => { if (mounted) { setCheckingSession(false); setError("Não foi possível verificar sua sessão. Tente entrar novamente."); } });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) { setUser(session?.user ?? null); setCheckingSession(false); }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(() => {
      window.location.replace(signedInDestination(user, { next: returnPath, onboarding: mode === "create" || new URLSearchParams(window.location.search).get("onboarding") === "1" }));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [user, mode, returnPath]);

  async function continueWithGoogle() {
    setPending(true);
    setError("");

    const callbackUrl = new URL("/app/auth.html", window.location.origin);
    callbackUrl.searchParams.set("next", returnPath);
    callbackUrl.searchParams.set("auth_callback", "1");
    callbackUrl.searchParams.set("onboarding", "1");

    try { const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    if (authError) {
      setError(authError.message);
      setPending(false);
    }
    } catch { setError("Não foi possível abrir o login com Google. Tente novamente."); setPending(false); }
  }

  async function submitCredentials(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    const credentials = { email: email.trim(), password };
    const callbackUrl = new URL("/app/auth.html", window.location.origin);
    callbackUrl.searchParams.set("next", returnPath);
    callbackUrl.searchParams.set("auth_callback", "1");
    if (mode === "create") callbackUrl.searchParams.set("onboarding", "1");

    try { const response = mode === "create"
      ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: callbackUrl.toString() },
        })
      : await supabase.auth.signInWithPassword(credentials);

    if (response.error) {
      setError(response.error.message);
    } else if (mode === "create" && !response.data.session) {
      setMessage("Enviamos um e-mail de confirmação. Abra-o para ativar sua conta.");
    } else {
      window.location.assign(signedInDestination(response.data.user, { next: returnPath, onboarding: mode === "create" }));
    }
    } catch { setError("Não foi possível conectar. Confira sua conexão e tente novamente."); }
    finally { setPending(false); }
  }

  async function signOut() {
    setPending(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign("/app/?signed_out=1");
    } catch { setError("Não foi possível sair. Tente novamente."); setPending(false); }
  }

  if (checkingSession) return <main className="auth-page"><p role="status">Verificando seu acesso…</p></main>;

  if (user) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--signed-in">
          <a className="auth-brand" href="/app/">Fusion</a>
          <span className="auth-eyebrow">{callbackFlow ? "Login concluído" : "Conta conectada"}</span>
          <h1>{callbackFlow ? "Tudo certo." : "Você já entrou."}</h1>
          <p>Olá, {displayName(user)}. Seus favoritos ficam sincronizados com esta conta.</p>
          <a className="auth-primary" href={signedInDestination(user, { next: returnPath, onboarding: mode === "create" || new URLSearchParams(window.location.search).get("onboarding") === "1" })}>
            {callbackFlow ? "Continuar para o Fusion" : "Abrir catálogo"}
          </a>
          <a className="auth-back" href="/app/favorites.html">Gerenciar favoritos</a>
          <a className="auth-back" href="/app/account.html">Minha conta</a>
          <button className="auth-text-button" type="button" onClick={signOut} disabled={pending}>
            Sair desta conta
          </button>
        </section>
      </main>
    );
  }

  const creating = mode === "create";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/app/">Fusion</a>
        <span className="auth-eyebrow">Sua biblioteca, do seu jeito</span>
        <h1>{creating ? "Crie sua conta" : "Entre na sua conta"}</h1>
        <p>{creating ? "Salve jogos favoritos e retome sua lista em qualquer dispositivo." : "Acesse sua lista de favoritos e continue descobrindo jogos."}</p>

        <button className="auth-google" type="button" onClick={continueWithGoogle} disabled={pending}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.79h3.14c1.84-1.7 2.92-4.2 2.92-7.75Z"/><path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.36l-3.14-2.79c-.87.58-1.98.93-3.29.93-2.53 0-4.67-1.7-5.44-4v2.88H3.32a9.72 9.72 0 0 0 8.68 5.34Z"/><path fill="#FBBC05" d="M6.56 13.53A5.83 5.83 0 0 1 6.25 12c0-.53.1-1.04.3-1.53V7.6H3.33A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.07 4.4l3.24-2.87Z"/><path fill="#EA4335" d="M12 6.47c1.43 0 2.7.49 3.7 1.44l2.78-2.79C16.82 3.57 14.62 2.25 12 2.25A9.72 9.72 0 0 0 3.32 7.6l3.24 2.87c.77-2.3 2.91-4 5.44-4Z"/></svg>
          {creating ? "Criar conta com Google" : "Continuar com Google"}
        </button>

        <div className="auth-divider"><span>ou use seu e-mail</span></div>

        <form className="auth-form" onSubmit={submitCredentials}>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} minLength="6" required /></label>
          {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button className="auth-primary" type="submit" disabled={pending}>{pending ? "Aguarde..." : creating ? "Criar conta" : "Entrar"}</button>
        </form>

        <p className="auth-switch">{creating ? "Já tem uma conta?" : "Ainda não tem conta?"} <button type="button" disabled={pending} onClick={() => { setMode(creating ? "sign-in" : "create"); setError(""); setMessage(""); }}>{creating ? "Entrar" : "Criar conta"}</button></p>
        {creating && <p className="auth-legal">Ao criar sua conta, consulte os <a href="/termos-de-uso/">Termos de uso</a> e a <a href="/politica-de-privacidade/">Política de Privacidade</a>.</p>}
        <a className="auth-back" href="/app/">← Voltar ao catálogo</a>
      </section>
    </main>
  );
}
