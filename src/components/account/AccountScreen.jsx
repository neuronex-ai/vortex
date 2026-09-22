import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import "../../styles/app-pages.css";

function displayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || "";
}

export function AccountScreen() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const nextUser = data.user ?? null;
      setUser(nextUser);
      setName(displayName(nextUser));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setName(displayName(nextUser));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });

    if (updateError) setError(updateError.message);
    else {
      setUser(data.user ?? user);
      setMessage("Perfil atualizado.");
    }

    setPending(false);
  }

  async function changePassword(event) {
    event.preventDefault();
    if (password.length < 6) return;

    setPending(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) setError(updateError.message);
    else {
      setPassword("");
      setMessage("Senha atualizada com sucesso.");
    }

    setPending(false);
  }

  async function signOut() {
    setPending(true);
    await supabase.auth.signOut();
    window.location.assign("/app/?signed_out=1");
  }

  if (!user) {
    return (
      <main className="fusion-page-shell">
        <header className="fusion-page-header">
          <a href="/app/" className="fusion-page-brand">Fusion</a>
          <a href="/" className="fusion-page-ghost">Voltar ao site</a>
        </header>
        <section className="fusion-account-empty">
          <span className="fusion-page-eyebrow">Sua conta</span>
          <h1>Entre para gerenciar seu perfil.</h1>
          <p>Favoritos e preferências ficam vinculados à sua conta Fusion.</p>
          <a className="fusion-page-primary" href="/app/auth.html?next=/app/account.html">Entrar no Fusion</a>
        </section>
      </main>
    );
  }

  const provider = user.app_metadata?.provider || "email";
  const createdAt = user.created_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(user.created_at))
    : "—";

  return (
    <main className="fusion-page-shell">
      <header className="fusion-page-header">
        <a href="/app/" className="fusion-page-brand">Fusion</a>
        <nav>
          <a href="/app/">Catálogo</a>
          <a href="/app/favorites.html">Favoritos</a>
          <a className="is-active" href="/app/account.html">Conta</a>
        </nav>
      </header>

      <section className="fusion-page-hero fusion-page-hero--compact">
        <span className="fusion-page-eyebrow">Conta Fusion</span>
        <h1>Seu espaço.</h1>
        <p>Gerencie informações básicas da sua conta e o acesso ao Fusion.</p>
      </section>

      <div className="fusion-account-grid">
        <section className="fusion-settings-card">
          <div className="fusion-settings-card__heading">
            <span>Identidade</span>
            <h2>Perfil</h2>
          </div>

          <form className="fusion-settings-form" onSubmit={saveProfile}>
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Como quer ser chamado?" />
            </label>
            <label>
              E-mail
              <input value={user.email ?? ""} disabled />
            </label>
            <button type="submit" disabled={pending}>Salvar perfil</button>
          </form>
        </section>

        <section className="fusion-settings-card">
          <div className="fusion-settings-card__heading">
            <span>Segurança</span>
            <h2>Acesso</h2>
          </div>

          <form className="fusion-settings-form" onSubmit={changePassword}>
            <label>
              Nova senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 6 caracteres"
                minLength="6"
              />
            </label>
            <button type="submit" disabled={pending || password.length < 6}>Atualizar senha</button>
          </form>
        </section>

        <section className="fusion-settings-card fusion-settings-card--summary">
          <div className="fusion-settings-card__heading">
            <span>Sessão</span>
            <h2>Resumo da conta</h2>
          </div>
          <dl className="fusion-account-meta">
            <div><dt>Login</dt><dd>{provider === "google" ? "Google" : "E-mail e senha"}</dd></div>
            <div><dt>Conta criada</dt><dd>{createdAt}</dd></div>
            <div><dt>ID</dt><dd>{user.id.slice(0, 8)}…</dd></div>
          </dl>
          <button className="fusion-danger-button" type="button" onClick={signOut} disabled={pending}>Sair desta conta</button>
        </section>
      </div>

      {(message || error) && (
        <div className={error ? "fusion-page-toast is-error" : "fusion-page-toast"} role="status">
          {error || message}
        </div>
      )}
    </main>
  );
}
