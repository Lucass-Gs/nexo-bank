import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  api,
  useSession,
  Login,
  Shell,
  Loading,
  Notice,
  Empty,
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
export default function App() {
  const s = useSession();
  if (s.loading) return <Loading />;
  if (!s.user)
    return (
      <Login
        title="Nexo Bank"
        subtitle="Cada movimento tem uma história. Explore um banco digital com consistência, eventos e recuperação de falhas."
        onLogin={s.setUser}
      />
    );
  return <Bank user={s.user} logout={() => s.setUser(null)} />;
}
function Bank({ user, logout }: { user: User; logout: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [beneficiaries, setBeneficiaries] = useState<
      { id: string; name: string }[]
    >([]),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [statement, setStatement] = useState<any[]>([]),
    [destination, setDestination] = useState(""),
    [amount, setAmount] = useState(""),
    [kind, setKind] = useState("internal"),
    [mode, setMode] = useState("success"),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [reconciliation, setReconciliation] = useState<any>(null);
  const key = useRef("");
  const active = useRef(true);
  const account = accounts[0];
  async function refresh() {
    const [a, b, t, s] = await Promise.all([
      api<Account[]>("/bank/accounts"),
      api<{ id: string; name: string }[]>("/bank/beneficiaries"),
      api<Transfer[]>("/bank/transfers"),
      api<any[]>("/bank/statement"),
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
      const transfer = await api("/bank/transfers", "POST", {
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
    });
  }
  const labels: Record<string, string> = {
    requested: "Recebida",
    reserved: "Saldo reservado",
    submitted: "Enviada",
    reconciling: "Em reconciliação",
    capturing: "Liquidando",
    releasing: "Liberando reserva",
    settled: "Concluída",
    rejected: "Rejeitada",
  };
  return (
    <Shell title="nexo.bank" user={user} onLogout={logout}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU DINHEIRO FICTÍCIO, EM MOVIMENTO</span>
          <h1>Olá, {user.name}.</h1>
          <p>
            Contas de demonstração. Nenhuma operação movimenta dinheiro real.
          </p>
        </div>
        <span className="tag">LABORATÓRIO BANCÁRIO</span>
      </div>
      <Notice error={error} />
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      {!account ? (
        <section className="panel">
          <h2>Abra sua conta de demonstração</h2>
          <p>
            Você recebe R$ 1.000,00 fictícios, registrados com partidas
            contábeis balanceadas.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/bank/accounts", "POST");
                await refresh();
              })
            }
          >
            Criar conta fictícia
          </button>
        </section>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <small>Disponível · BRL</small>
              <strong>{money(account.available)}</strong>
            </div>
            <div className="stat">
              <small>Reservado</small>
              <strong>{money(account.reserved)}</strong>
            </div>
            <div className="stat">
              <small>Saldo contábil</small>
              <strong>{money(account.balance)}</strong>
            </div>
          </div>
          <div className="two-col">
            <section className="panel">
              <span className="eyebrow">NOVA TRANSFERÊNCIA</span>
              <h2>Conecte duas contas.</h2>
              <form onSubmit={send}>
                <label>
                  Tipo de operação
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      key.current = "";
                    }}
                  >
                    <option value="internal">Entre contas Nexo</option>
                    <option value="external">
                      Contraparte externa simulada
                    </option>
                  </select>
                </label>
                {kind === "internal" ? (
                  <label>
                    Conta de destino
                    <select
                      required
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.target.value);
                        key.current = "";
                      }}
                    >
                      <option value="">Selecione uma conta</option>
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} · {b.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Cenário do simulador
                    <select
                      value={mode}
                      onChange={(e) => {
                        setMode(e.target.value);
                        key.current = "";
                      }}
                    >
                      <option value="success">Sucesso</option>
                      <option value="reject">
                        Recusa com liberação de reserva
                      </option>
                      <option value="timeout">
                        Sucesso externo com resposta perdida
                      </option>
                    </select>
                  </label>
                )}
                <label>
                  Valor em reais
                  <input
                    inputMode="decimal"
                    placeholder="150.00"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      key.current = "";
                    }}
                    required
                  />
                </label>
                <button disabled={busy}>Transferir valor fictício →</button>
              </form>
              <p className="fine" style={{ marginTop: 20 }}>
                Saldo consultado no ledger. Extrato atualizado por eventos
                Kafka. Em caso de resposta perdida, repita sem alterar o
                formulário.
              </p>
            </section>
            <section className="panel">
              <span className="eyebrow">PROCESSAMENTO</span>
              <h2>Operações recentes</h2>
              {!transfers.length && (
                <Empty>Nenhuma transferência solicitada.</Empty>
              )}
              {transfers.slice(0, 8).map((t) => (
                <div className="order" key={t.id}>
                  <div className="split-label">
                    <strong>{money(t.amount)}</strong>
                    <span className="tag">{labels[t.status] || t.status}</span>
                  </div>
                  <p>
                    {t.kind === "internal"
                      ? "Entre contas"
                      : "Externa simulada"}{" "}
                    · {t.id.slice(0, 8)}
                  </p>
                  {t.error && <p>{t.error}</p>}
                </div>
              ))}
            </section>
          </div>
          <section className="panel" style={{ marginTop: 24 }}>
            <div className="split-label">
              <div>
                <span className="eyebrow">PROJEÇÃO POR EVENTOS</span>
                <h2>Seu extrato</h2>
              </div>
              <button className="ghost" onClick={() => run(refresh)}>
                Atualizar
              </button>
            </div>
            <p className="fine">
              Consistência eventual: um lançamento pode aparecer após o saldo
              autoritativo.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Lançamento</th>
                    <th>Referência</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((e) => (
                    <tr key={e.entry_id}>
                      <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                      <td>{e.description}</td>
                      <td className={BigInt(e.amount) > 0n ? "success" : ""}>
                        {money(e.amount)}
                      </td>
                      <td>{e.journal_id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!statement.length && <Empty>Aguardando eventos do ledger.</Empty>}
          </section>
        </>
      )}
      {user.role === "admin" && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2>Reconciliação contábil</h2>
          <p>
            Verifique se os journals estão balanceados e os saldos correspondem
            à soma das partidas.
          </p>
          <button
            className="ghost"
            onClick={() =>
              run(async () =>
                setReconciliation(await api("/bank/reconciliation")),
              )
            }
          >
            Verificar invariantes
          </button>
          {reconciliation && (
            <p
              role="status"
              className={
                reconciliation.unbalanced.length ||
                reconciliation.balanceDrift.length
                  ? "error"
                  : "success"
              }
              style={{ marginTop: 15 }}
            >
              {reconciliation.journals} journals ·{" "}
              {reconciliation.unbalanced.length} desequilíbrios ·{" "}
              {reconciliation.balanceDrift.length} divergências de saldo
            </p>
          )}
        </section>
      )}
    </Shell>
  );
}
