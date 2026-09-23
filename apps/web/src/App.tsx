import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  api,
  useSession,
  Login,
  Loading,
  Notice,
  money,
  type User,
} from "./shared";

type Account = {
  id: string;
  name: string;
  balance: string;
  reserved: string;
  available: string;
};
type Transfer = {
  id: string;
  amount: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
};
type Entry = {
  entry_id: string;
  amount: string;
  description: string;
  journal_id: string;
  created_at: string;
};

export default function App() {
  const session = useSession();
  if (session.loading) return <Loading />;
  if (!session.user)
    return (
      <Login
        title="Nexo Bank"
        subtitle="Uma conta digital de demonstração para explorar transferências, extrato e segurança com dados fictícios."
        onLogin={session.setUser}
      />
    );
  return <Bank user={session.user} logout={() => session.setUser(null)} />;
}

function Bank({ user, logout }: { user: User; logout: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [beneficiaries, setBeneficiaries] = useState<
      { id: string; name: string }[]
    >([]),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [statement, setStatement] = useState<Entry[]>([]);
  const [destination, setDestination] = useState(""),
    [amount, setAmount] = useState(""),
    [kind, setKind] = useState("internal"),
    [mode, setMode] = useState("success");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [reconciliation, setReconciliation] = useState<any>(null);
  const [section, setSection] = useState("inicio"),
    [showBalance, setShowBalance] = useState(true),
    [statementQuery, setStatementQuery] = useState(""),
    [cardFrozen, setCardFrozen] = useState(false),
    [pixCopied, setPixCopied] = useState(false);
  const key = useRef(""),
    active = useRef(true),
    account = accounts[0];
  async function refresh() {
    const [a, b, t, s] = await Promise.all([
      api<Account[]>("/bank/accounts"),
      api<{ id: string; name: string }[]>("/bank/beneficiaries"),
      api<Transfer[]>("/bank/transfers"),
      api<Entry[]>("/bank/statement"),
    ]);
    if (!active.current) return;
    setAccounts(a);
    setBeneficiaries(b.filter((x) => x.id !== a[0]?.id));
    setTransfers(t);
    setStatement(s);
  }
  useEffect(() => {
    active.current = true;
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 2500);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!/^\d+(\.\d{1,2})?$/.test(amount))
        throw Error("Informe um valor com até duas casas decimais.");
      const [whole, part = ""] = amount.split(".");
      const cents = (
        BigInt(whole) * 100n +
        BigInt(part.padEnd(2, "0"))
      ).toString();
      if (!key.current) key.current = crypto.randomUUID();
      const transfer = await api<Transfer>("/bank/transfers", "POST", {
        idempotencyKey: key.current,
        sourceId: account.id,
        ...(kind === "internal" ? { destinationId: destination } : {}),
        amount: cents,
        kind,
        mode,
      });
      setSuccess(
        "Transferência " +
          transfer.id.slice(0, 8) +
          " recebida. Acompanhe o processamento.",
      );
      key.current = "";
      setAmount("");
      await refresh();
      setSection("inicio");
    });
  }
  const filteredStatement = useMemo(
    () =>
      statement.filter(
        (e) =>
          !statementQuery ||
          (e.description + e.journal_id)
            .toLowerCase()
            .includes(statementQuery.toLowerCase()),
      ),
    [statement, statementQuery],
  );
  const labels: Record<string, string> = {
    requested: "Em análise",
    reserved: "Saldo reservado",
    submitted: "Enviada",
    reconciling: "Em reconciliação",
    capturing: "Liquidando",
    releasing: "Liberando",
    settled: "Concluída",
    rejected: "Recusada",
  };
  function exportStatement() {
    const csv = [
      "data,descricao,valor,referencia",
      ...filteredStatement.map(
        (e) => `${e.created_at},"${e.description}",${e.amount},${e.journal_id}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "extrato-nexo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function copyPix() {
    await navigator.clipboard?.writeText("lucas.demo@nexo.bank");
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 1800);
  }
  return (
    <div className="bank-app">
      <aside className="bank-sidebar">
        <a className="bank-logo" href="#inicio">
          nexo<span>bank</span>
          <b>•</b>
        </a>
        <p className="sidebar-caption">CONTA PESSOAL</p>
        <nav aria-label="Navegação da conta">
          <button
            className={section === "inicio" ? "active" : ""}
            onClick={() => setSection("inicio")}
          >
            ⌂ <span>Visão geral</span>
          </button>
          <button
            className={section === "transferir" ? "active" : ""}
            onClick={() => setSection("transferir")}
          >
            ↗ <span>Transferir</span>
          </button>
          <button
            className={section === "extrato" ? "active" : ""}
            onClick={() => setSection("extrato")}
          >
            ▤ <span>Extrato</span>
          </button>
          <button
            className={section === "cartao" ? "active" : ""}
            onClick={() => setSection("cartao")}
          >
            ▣ <span>Cartão</span>
          </button>
          <button
            className={section === "seguranca" ? "active" : ""}
            onClick={() => setSection("seguranca")}
          >
            ⌑ <span>Segurança</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" /> Ambiente de demonstração
          <button className="sidebar-logout" onClick={logout}>
            Sair da conta
          </button>
        </div>
      </aside>
      <main className="bank-main">
        <header className="bank-topbar">
          <div>
            <span className="mobile-kicker">NEXO BANK / CONTA PESSOAL</span>
            <h1>
              {section === "inicio"
                ? `Bom dia, ${user.name.split(" ")[0]}`
                : section === "transferir"
                  ? "Transferir dinheiro"
                  : section === "extrato"
                    ? "Seu extrato"
                    : section === "cartao"
                      ? "Cartão de demonstração"
                      : "Segurança da conta"}
            </h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notificações">
              ♢<i />
            </button>
            <button className="avatar" aria-label="Menu do usuário">
              {user.name.slice(0, 1)}
            </button>
          </div>
        </header>
        <Notice error={error} />
        {success && (
          <p className="bank-success" role="status">
            ✓ {success}
          </p>
        )}
        {!account ? (
          <section className="bank-empty">
            <span className="eyebrow">PRIMEIRO ACESSO</span>
            <h2>Abra sua conta de demonstração</h2>
            <p>
              Você recebe R$ 1.000,00 fictícios, registrados em um ledger de
              partidas balanceadas.
            </p>
            <button
              onClick={() =>
                run(async () => {
                  await api("/bank/accounts", "POST");
                  await refresh();
                })
              }
              disabled={busy}
            >
              Criar conta fictícia
            </button>
          </section>
        ) : (
          <>
            {section === "inicio" && (
              <Overview
                account={account}
                showBalance={showBalance}
                setShowBalance={setShowBalance}
                transfers={transfers}
                labels={labels}
                setSection={setSection}
                statement={statement}
                copyPix={copyPix}
                pixCopied={pixCopied}
              />
            )}
            {section === "transferir" && (
              <TransferPanel
                account={account}
                beneficiaries={beneficiaries}
                kind={kind}
                setKind={setKind}
                destination={destination}
                setDestination={setDestination}
                mode={mode}
                setMode={setMode}
                amount={amount}
                setAmount={setAmount}
                send={send}
                busy={busy}
              />
            )}
            {section === "extrato" && (
              <StatementPanel
                statement={filteredStatement}
                query={statementQuery}
                setQuery={setStatementQuery}
                exportStatement={exportStatement}
              />
            )}
            {section === "cartao" && (
              <CardPanel frozen={cardFrozen} setFrozen={setCardFrozen} />
            )}
            {section === "seguranca" && <SecurityPanel user={user} />}
          </>
        )}
      </main>
      {user.role === "admin" && (
        <button
          className="reconcile-fab"
          onClick={() =>
            run(async () =>
              setReconciliation(await api("/bank/reconciliation")),
            )
          }
        >
          Verificar contabilidade
        </button>
      )}
      {reconciliation && (
        <div className="reconcile-toast" role="status">
          {reconciliation.journals} journals ·{" "}
          {reconciliation.unbalanced.length} desequilíbrios ·{" "}
          {reconciliation.balanceDrift.length} divergências
        </div>
      )}
    </div>
  );
}

function Overview({
  account,
  showBalance,
  setShowBalance,
  transfers,
  labels,
  setSection,
  statement,
  copyPix,
  pixCopied,
}: any) {
  return (
    <div className="bank-content" id="inicio">
      <div className="account-hero">
        <div>
          <span className="eyebrow">SALDO DISPONÍVEL · BRL</span>
          <strong>
            {showBalance ? money(account.available) : "R$ ••••••"}
          </strong>
          <button
            className="balance-toggle"
            onClick={() => setShowBalance(!showBalance)}
          >
            {showBalance ? "Ocultar saldo" : "Mostrar saldo"}
          </button>
        </div>
        <div className="account-number">
          <span>CONTA NEXO</span>
          <b>•••• {account.id.slice(-4)}</b>
          <small>Agência 0001 · Conta corrente</small>
        </div>
      </div>
      <div className="quick-actions">
        <button onClick={() => setSection("transferir")}>
          <b>↗</b>
          <span>Transferir</span>
        </button>
        <button onClick={copyPix}>
          <b>⌁</b>
          <span>{pixCopied ? "Chave copiada" : "Copiar Pix"}</span>
        </button>
        <button onClick={() => setSection("cartao")}>
          <b>▣</b>
          <span>Meu cartão</span>
        </button>
        <button onClick={() => setSection("extrato")}>
          <b>↓</b>
          <span>Extrato</span>
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="bank-card spending-card">
          <div className="section-title">
            <div>
              <span className="eyebrow">MOVIMENTAÇÕES</span>
              <h2>Últimas atividades</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setSection("extrato")}
            >
              Ver tudo →
            </button>
          </div>
          {transfers.slice(0, 4).map((t: Transfer) => (
            <div className="activity-row order" key={t.id}>
              <span
                className={`activity-icon ${t.status === "rejected" ? "negative" : ""}`}
              >
                {t.kind === "internal" ? "↗" : "◎"}
              </span>
              <div>
                <b>
                  {t.kind === "internal"
                    ? "Transferência Nexo"
                    : "Simulação externa"}
                </b>
                <small>
                  {new Date(t.created_at).toLocaleDateString("pt-BR")} ·{" "}
                  {labels[t.status] || t.status}
                </small>
              </div>
              <strong>{money(t.amount)}</strong>
            </div>
          ))}
          {!transfers.length && (
            <p className="muted-empty">Nenhuma movimentação recente.</p>
          )}
        </section>
        <section className="bank-card card-preview">
          <div className="section-title">
            <div>
              <span className="eyebrow">CARTÃO VIRTUAL</span>
              <h2>Seu cartão</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setSection("cartao")}
            >
              Gerenciar
            </button>
          </div>
          <div className="virtual-card">
            <span>
              nexo<span>bank</span>
            </span>
            <b>◉</b>
            <strong>**** {account.id.slice(-4)}</strong>
            <small>LUCAS GABRIEL</small>
          </div>
          <div className="card-limit">
            <span>Limite utilizado</span>
            <b>
              R$ 0,00 <small>de R$ 2.500,00</small>
            </b>
            <i>
              <em />
            </i>
          </div>
        </section>
      </div>
      <section className="bank-card statement-preview">
        <div className="section-title">
          <div>
            <span className="eyebrow">PROJEÇÃO POR EVENTOS</span>
            <h2>Extrato recente</h2>
          </div>
          <button className="text-button" onClick={() => setSection("extrato")}>
            Abrir extrato →
          </button>
        </div>
        {statement.slice(0, 3).map((e: Entry) => (
          <div className="activity-row" key={e.entry_id}>
            <span className="activity-icon">↙</span>
            <div>
              <b>{e.description}</b>
              <small>
                {new Date(e.created_at).toLocaleDateString("pt-BR")} ·{" "}
                {e.journal_id.slice(0, 8)}
              </small>
            </div>
            <strong className={BigInt(e.amount) > 0n ? "positive" : ""}>
              {money(e.amount)}
            </strong>
          </div>
        ))}
      </section>
    </div>
  );
}

function TransferPanel(p: any) {
  return (
    <div className="bank-content narrow-content">
      <div className="form-intro">
        <span className="eyebrow">PAGAMENTOS E TRANSFERÊNCIAS</span>
        <h2>Envie dinheiro com segurança.</h2>
        <p>
          A operação é fictícia, mas o fluxo respeita idempotência, reserva de
          saldo e processamento assíncrono.
        </p>
      </div>
      <section className="bank-card transfer-card">
        <div className="transfer-tabs">
          <button
            className={p.kind === "internal" ? "selected" : ""}
            onClick={() => p.setKind("internal")}
          >
            Entre contas Nexo
          </button>
          <button
            className={p.kind === "external" ? "selected" : ""}
            onClick={() => p.setKind("external")}
          >
            Contraparte externa
          </button>
        </div>
        <form onSubmit={p.send}>
          {p.kind === "internal" ? (
            <label>
              Conta de destino
              <select
                required
                value={p.destination}
                onChange={(e) => p.setDestination(e.target.value)}
              >
                <option value="">Selecione uma conta</option>
                {p.beneficiaries.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Cenário da contraparte
              <select
                value={p.mode}
                onChange={(e) => p.setMode(e.target.value)}
              >
                <option value="success">Sucesso confirmado</option>
                <option value="reject">Recusa e liberação</option>
                <option value="timeout">
                  Resposta perdida e reconciliação
                </option>
              </select>
            </label>
          )}
          <label>
            Valor em reais
            <input
              aria-label="Valor em reais"
              inputMode="decimal"
              placeholder="0,00"
              value={p.amount}
              onChange={(e) => p.setAmount(e.target.value)}
              required
            />
          </label>
          <div className="transfer-review">
            <span>
              Origem <b>Conta corrente · BRL</b>
            </span>
            <span>
              Disponível <b>{money(p.account.available)}</b>
            </span>
          </div>
          <button className="primary-action" disabled={p.busy}>
            Transferir valor fictício <span>→</span>
          </button>
        </form>
      </section>
      <p className="security-note">
        ⌑ Operação protegida por sessão, token CSRF e chave de idempotência.
      </p>
    </div>
  );
}

function StatementPanel({ statement, query, setQuery, exportStatement }: any) {
  return (
    <div className="bank-content">
      <div className="statement-toolbar">
        <div>
          <span className="eyebrow">CONTA CORRENTE · BRL</span>
          <h2>Movimentações</h2>
        </div>
        <button className="outline-action" onClick={exportStatement}>
          ↓ Exportar CSV
        </button>
      </div>
      <div className="statement-filters">
        <input
          aria-label="Buscar no extrato"
          placeholder="Buscar por descrição ou referência"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Período">
          <option>Últimos lançamentos</option>
          <option>Este mês</option>
          <option>Últimos 90 dias</option>
        </select>
      </div>
      <section className="bank-card statement-table">
        <div className="table-head">
          <span>LANÇAMENTO</span>
          <span>DATA</span>
          <span>VALOR</span>
        </div>
        {statement.map((e: Entry) => (
          <div className="statement-line" key={e.entry_id}>
            <div>
              <span className="activity-icon">↙</span>
              <b>{e.description}</b>
              <small>Ref. {e.journal_id.slice(0, 8)}</small>
            </div>
            <span>{new Date(e.created_at).toLocaleDateString("pt-BR")}</span>
            <strong className={BigInt(e.amount) > 0n ? "positive" : ""}>
              {money(e.amount)}
            </strong>
          </div>
        ))}
        {!statement.length && (
          <p className="muted-empty">Nenhum lançamento corresponde à busca.</p>
        )}
      </section>
    </div>
  );
}

function CardPanel({ frozen, setFrozen }: any) {
  return (
    <div className="bank-content narrow-content">
      <div className="form-intro">
        <span className="eyebrow">MEIOS DE PAGAMENTO</span>
        <h2>Seu cartão virtual</h2>
        <p>
          Controle o cartão de demonstração, limite e compras online pelo mesmo
          painel.
        </p>
      </div>
      <section className="bank-card card-management">
        <div className="virtual-card large-card">
          <span>
            nexo<span>bank</span>
          </span>
          <b>◉</b>
          <strong>**** **** **** 1539</strong>
          <small>LUCAS GABRIEL · 12/29</small>
        </div>
        <div className="card-control">
          <div>
            <b>Cartão virtual</b>
            <small>Compras online e assinaturas</small>
          </div>
          <span className={frozen ? "status-pill frozen" : "status-pill"}>
            {frozen ? "Congelado" : "Ativo"}
          </span>
        </div>
        <button
          className={frozen ? "primary-action" : "outline-action"}
          onClick={() => setFrozen(!frozen)}
        >
          {frozen ? "Descongelar cartão" : "Congelar cartão"}
        </button>
        <div className="limit-row">
          <span>Limite mensal</span>
          <b>R$ 2.500,00</b>
        </div>
      </section>
    </div>
  );
}

function SecurityPanel({ user }: { user: User }) {
  return (
    <div className="bank-content narrow-content">
      <div className="form-intro">
        <span className="eyebrow">CENTRAL DE SEGURANÇA</span>
        <h2>Proteja sua conta.</h2>
        <p>
          Controles de demonstração que representam os pontos de uma conta
          digital real.
        </p>
      </div>
      <section className="bank-card security-list">
        <div>
          <span className="security-icon">✓</span>
          <div>
            <b>Sessão protegida</b>
            <small>Cookie HttpOnly · expira em 24 horas</small>
          </div>
          <em>Ativo</em>
        </div>
        <div>
          <span className="security-icon">⌑</span>
          <div>
            <b>Proteção contra ações forjadas</b>
            <small>Token CSRF e validação de origem</small>
          </div>
          <em>Ativo</em>
        </div>
        <div>
          <span className="security-icon">◎</span>
          <div>
            <b>Perfil conectado</b>
            <small>{user.email}</small>
          </div>
          <em>{user.role === "admin" ? "Admin" : "Cliente"}</em>
        </div>
      </section>
    </div>
  );
}
