"use client";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
export type User = { id: string; name: string; email: string; role: string };
let csrf = "";
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const value = await res
    .json()
    .catch(() => ({
      message: "Servi?o temporariamente indispon?vel. Tente novamente.",
    }));
  if (!res.ok)
    throw Object.assign(
      new Error(value.message || "Não foi possível concluir."),
      { status: res.status },
    );
  if (value.csrf) csrf = value.csrf;
  return value;
}
export function useSession() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/auth/me")
      .then((x) => setUser(x.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { user, setUser, loading };
}
export function Login({
  title,
  subtitle,
  onLogin,
}: {
  title: string;
  subtitle: string;
  onLogin: (u: User) => void;
}) {
  const [email, setEmail] = useState("alice@example.test"),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api(
        register ? "/auth/register" : "/auth/login",
        "POST",
        { email, password, name },
      );
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-intro">
        <span className="eyebrow">LUCAS SANTOS / ENGINEERING LAB</span>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{subtitle}</p>
        <div className="architecture">
          <span>REACT</span>
          <i>→</i>
          <span>NODE.JS</span>
          <i>→</i>
          <span>POSTGRESQL</span>
        </div>
        <p className="fine">Aplicação de demonstração · Dados fictícios</p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">SEU WORKSPACE</span>
        <h2>{register ? "Crie sua conta" : "Bem-vindo de volta"}</h2>
        <p>Entre para explorar a aplicação.</p>
        {register && (
          <label>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
            />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Aguarde…" : register ? "Criar conta" : "Entrar →"}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "Já tenho conta" : "Criar uma conta"}
        </button>
        <p className="fine">
          Contas demo: alice@example.test, bruno@example.test e
          carla@example.test. A senha está no .env.example do ambiente local.
        </p>
      </form>
    </main>
  );
}
export function Shell({
  title,
  user,
  onLogout,
  children,
}: {
  title: string;
  user: User;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <header>
        <a className="brand" href="/">
          {title}
          <span>.</span>
        </a>
        <span className="header-label">WORKSPACE / DEMONSTRAÇÃO</span>
        <div className="user">
          <span>{user.name}</span>
          <button
            className="ghost"
            onClick={async () => {
              await api("/auth/logout", "POST");
              onLogout();
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="workspace">{children}</main>
      <footer>
        Lucas Santos · React & Node.js{" "}
        <span>Dados fictícios / ambiente de demonstração</span>
      </footer>
    </>
  );
}
export function Notice({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Loading() {
  return (
    <main className="workspace">
      <p role="status">Carregando aplicação…</p>
    </main>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export const money = (cents: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(cents) / 100,
  );
