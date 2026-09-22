import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";

function safeReturnPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/app/") ? next : "/app/";
}

function displayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "sua conta";
}

export function AuthScreen() {
  const returnPath = useMemo(safeReturnPath, []);
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data, error: sessionError }) => {
      if (!mounted || sessionError) return;
      setUser(data.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function continueWithGoogle() {
    setPending(true);
    setError("");

    const callbackUrl = new URL("/app/auth.html", window.location.origin);
    callbackUrl.searchParams.set("next", returnPath);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    if (authError) {
      setError(authError.message);
      setPending(false);
    }
  }

  async function submitCredentials(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    const credentials = { email: email.trim(), password };
    const response = mode === "create"
      ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: new URL("/app/auth.html", window.location.origin).toString() },
        })
      : await supabase.auth.signInWithPassword(credentials);

    if (response.error) {
      setError(response.error.message);
    } else if (mode === "create" && !response.data.session) {
      setMessage("Enviamos um e-mail de confirmação. Abra-o para ativar sua conta.");
    } else {
      window.location.assign(returnPath);
    }

    setPending(false);
  }

  async function signOut() {
    setPending(true);
    await supabase.auth.signOut();
    setPending(false);
  }

  if (user) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--signed-in">
          <a className="auth-brand" href="/app/">Fusion</a>
          <span className="auth-eyebrow">Conta conectada</span>
          <h1>Você já entrou.</h1>
          <p>Olá, {displayName(user)}. Seus favoritos poderão acompanhar você onde entrar.</p>
          <a className="auth-primary" href={returnPath}>Abrir catálogo</a>
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

        <p className="auth-switch">{creating ? "Já tem uma conta?" : "Ainda não tem conta?"} <button type="button" onClick={() => { setMode(creating ? "sign-in" : "create"); setError(""); setMessage(""); }}>{creating ? "Entrar" : "Criar conta"}</button></p>
        <a className="auth-back" href="/app/">← Voltar ao catálogo</a>
      </section>
    </main>
  );
}
