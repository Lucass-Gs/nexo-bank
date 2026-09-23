import "./telemetry";
import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { createHash } from "node:crypto";
import { PoolClient } from "pg";
import { Db } from "./db";
import { boot } from "./micro";
import { relay } from "./messaging";
const FUNDING = "90000000-0000-4000-8000-000000000001",
  CLEARING = "90000000-0000-4000-8000-000000000002";
export const amountSchema = z.string().regex(/^[1-9]\d{0,11}$/);
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function journal(
  c: PoolClient,
  command: string,
  source: string,
  destination: string,
  amount: string,
  description: string,
) {
  const payload = hash({ source, destination, amount });
  const old = (
    await c.query("SELECT * FROM journals WHERE command_id=$1", [command])
  ).rows[0];
  if (old) {
    if (old.payload_hash !== payload)
      throw new ConflictException("Comando reutilizado com outro conteúdo.");
    return old;
  }
  const j = (
    await c.query(
      "INSERT INTO journals(command_id,payload_hash,description) VALUES($1,$2,$3) RETURNING *",
      [command, payload, description],
    )
  ).rows[0];
  await c.query(
    "INSERT INTO entries(journal_id,account_id,amount) VALUES($1,$2,-$4::bigint),($1,$3,$4::bigint)",
    [j.id, source, destination, amount],
  );
  await c.query("UPDATE accounts SET balance=balance-$1 WHERE id=$2", [
    amount,
    source,
  ]);
  await c.query("UPDATE accounts SET balance=balance+$1 WHERE id=$2", [
    amount,
    destination,
  ]);
  const entries = (
    await c.query(
      "SELECT e.*,a.owner_id FROM entries e JOIN accounts a ON a.id=e.account_id WHERE journal_id=$1",
      [j.id],
    )
  ).rows;
  await c.query("INSERT INTO outbox(payload) VALUES($1)", [
    JSON.stringify({
      journalId: j.id,
      description,
      createdAt: j.created_at,
      entries,
    }),
  ]);
  return j;
}
@Controller("internal")
class LedgerController {
  constructor(private readonly db: Db) {}
  @Post("accounts") async create(
    @Headers("x-user-id") user: string,
    @Body() input: unknown,
  ) {
    const { name } = z.object({ name: z.string().min(2).max(80) }).parse(input);
    z.uuid().parse(user);
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        user,
      ]);
      const old = (
        await c.query("SELECT * FROM accounts WHERE owner_id=$1", [user])
      ).rows[0];
      if (old) return old;
      const a = (
        await c.query(
          "INSERT INTO accounts(owner_id,name) VALUES($1,$2) RETURNING *",
          [user, name],
        )
      ).rows[0];
      await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
        FUNDING,
      ]);
      await journal(
        c,
        "fund:" + user,
        FUNDING,
        a.id,
        "100000",
        "Crédito inicial fictício",
      );
      return (await c.query("SELECT * FROM accounts WHERE id=$1", [a.id]))
        .rows[0];
    });
  }
  @Get("accounts") async mine(@Headers("x-user-id") user: string) {
    return (
      await this.db.query(
        "SELECT *,balance-reserved AS available FROM accounts WHERE owner_id=$1",
        [z.uuid().parse(user)],
      )
    ).rows;
  }
  @Get("beneficiaries") async beneficiaries() {
    return (
      await this.db.query(
        "SELECT id,name FROM accounts WHERE technical=false ORDER BY name",
      )
    ).rows;
  }
  @Post("transfer") async transfer(
    @Headers("x-user-id") user: string,
    @Body() input: unknown,
  ) {
    const p = z
      .object({
        commandId: z.uuid(),
        sourceId: z.uuid(),
        destinationId: z.uuid(),
        amount: amountSchema,
      })
      .parse(input);
    if (p.sourceId === p.destinationId)
      throw new ConflictException("Escolha outra conta.");
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        p.commandId,
      ]);
      const accounts = (
        await c.query(
          "SELECT * FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [[p.sourceId, p.destinationId]],
        )
      ).rows;
      const from = accounts.find((a) => a.id === p.sourceId),
        to = accounts.find((a) => a.id === p.destinationId);
      if (!from || from.owner_id !== user || !to || to.technical)
        throw new NotFoundException("Conta não encontrada.");
      const prior = (
        await c.query("SELECT 1 FROM journals WHERE command_id=$1", [
          p.commandId,
        ])
      ).rowCount;
      if (
        !prior &&
        BigInt(from.balance) - BigInt(from.reserved) < BigInt(p.amount)
      )
        throw new ConflictException("Saldo insuficiente.");
      return journal(
        c,
        p.commandId,
        from.id,
        to.id,
        p.amount,
        "Transferência interna",
      );
    });
  }
  @Post("holds") async hold(
    @Headers("x-user-id") user: string,
    @Body() input: unknown,
  ) {
    const p = z
      .object({ id: z.uuid(), accountId: z.uuid(), amount: amountSchema })
      .parse(input);
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        p.id,
      ]);
      const a = (
        await c.query(
          "SELECT * FROM accounts WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [p.accountId, user],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      const old = (await c.query("SELECT * FROM holds WHERE id=$1", [p.id]))
        .rows[0];
      if (old) {
        if (old.account_id !== p.accountId || old.amount !== p.amount)
          throw new ConflictException("Reserva divergente.");
        return old;
      }
      if (BigInt(a.balance) - BigInt(a.reserved) < BigInt(p.amount))
        throw new ConflictException("Saldo insuficiente.");
      await c.query("UPDATE accounts SET reserved=reserved+$1 WHERE id=$2", [
        p.amount,
        a.id,
      ]);
      return (
        await c.query(
          "INSERT INTO holds(id,account_id,amount) VALUES($1,$2,$3) RETURNING *",
          [p.id, a.id, p.amount],
        )
      ).rows[0];
    });
  }
  @Post("holds/:id/:action") async finishHold(
    @Headers("x-user-id") user: string,
    @Param("id") id: string,
    @Param("action") action: string,
  ) {
    z.uuid().parse(id);
    z.enum(["capture", "release"]).parse(action);
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        id,
      ]);
      const hold = (
        await c.query("SELECT * FROM holds WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!hold) throw new NotFoundException();
      const account = (
        await c.query(
          "SELECT * FROM accounts WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [hold.account_id, user],
        )
      ).rows[0];
      if (!account) throw new NotFoundException();
      const target = action === "capture" ? "captured" : "released";
      if (hold.status === target) return hold;
      if (hold.status !== "reserved")
        throw new ConflictException("Reserva já finalizada.");
      await c.query("UPDATE accounts SET reserved=reserved-$1 WHERE id=$2", [
        hold.amount,
        hold.account_id,
      ]);
      if (action === "capture") {
        await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
          CLEARING,
        ]);
        await journal(
          c,
          id,
          hold.account_id,
          CLEARING,
          hold.amount,
          "Liquidação externa simulada",
        );
      }
      return (
        await c.query("UPDATE holds SET status=$1 WHERE id=$2 RETURNING *", [
          target,
          id,
        ])
      ).rows[0];
    });
  }
  @Get("reconciliation") async reconcile() {
    return {
      unbalanced: (
        await this.db.query(
          "SELECT journal_id FROM entries GROUP BY journal_id HAVING sum(amount)<>0",
        )
      ).rows,
      balanceDrift: (
        await this.db.query(
          "SELECT a.id FROM accounts a LEFT JOIN entries e ON e.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(sum(e.amount),0)",
        )
      ).rows,
      journals: Number(
        (await this.db.query("SELECT count(*) FROM journals")).rows[0].count,
      ),
    };
  }
}
if (require.main === module)
  boot(LedgerController, (db) => relay(db)).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
