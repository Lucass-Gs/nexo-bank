import "./telemetry";
import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Db } from "./db";
import { boot, remote, RemoteError } from "./micro";
import { amountSchema } from "./ledger";
@Controller("internal")
class TransfersController {
  constructor(private readonly db: Db) {}
  @Post("transfers") async create(
    @Headers("x-user-id") user: string,
    @Body() input: unknown,
  ) {
    const p = z
      .object({
        idempotencyKey: z.string().min(8).max(100),
        sourceId: z.uuid(),
        destinationId: z.uuid().optional(),
        amount: amountSchema,
        kind: z.enum(["internal", "external"]),
        mode: z.enum(["success", "reject", "timeout"]).default("success"),
      })
      .parse(input);
    z.uuid().parse(user);
    if (
      p.kind === "internal" &&
      (!p.destinationId || p.destinationId === p.sourceId)
    )
      throw new ConflictException("Escolha uma conta de destino diferente.");
    const accounts = await remote(
      "ledger",
      "/internal/accounts",
      "GET",
      undefined,
      user,
    );
    if (!accounts.some((a: any) => a.id === p.sourceId))
      throw new ConflictException("Conta de origem inválida.");
    const hash = createHash("sha256").update(JSON.stringify(p)).digest("hex");
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        user + ":" + p.idempotencyKey,
      ]);
      const old = (
        await c.query(
          "SELECT * FROM transfers WHERE user_id=$1 AND idempotency_key=$2",
          [user, p.idempotencyKey],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== hash)
          throw new ConflictException("Chave reutilizada com outro conteúdo.");
        return old;
      }
      return (
        await c.query(
          "INSERT INTO transfers(user_id,idempotency_key,payload_hash,source_id,destination_id,amount,kind,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            user,
            p.idempotencyKey,
            hash,
            p.sourceId,
            p.destinationId || null,
            p.amount,
            p.kind,
            p.mode,
          ],
        )
      ).rows[0];
    });
  }
  @Get("transfers") async list(@Headers("x-user-id") user: string) {
    return (
      await this.db.query(
        "SELECT * FROM transfers WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [z.uuid().parse(user)],
      )
    ).rows;
  }
}
async function work(db: Db) {
  let running = true;
  process.on("SIGTERM", () => {
    running = false;
  });
  while (running) {
    try {
      await db.tx(async (c) => {
        const t = (
          await c.query(
            "SELECT * FROM transfers WHERE status NOT IN ('settled','rejected') ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1",
          )
        ).rows[0];
        if (!t) return;
        let status = t.status,
          error: null | string = null;
        try {
          if (t.kind === "internal") {
            await remote(
              "ledger",
              "/internal/transfer",
              "POST",
              {
                commandId: t.id,
                sourceId: t.source_id,
                destinationId: t.destination_id,
                amount: t.amount,
              },
              t.user_id,
            );
            status = "settled";
          } else if (status === "requested") {
            await remote(
              "ledger",
              "/internal/holds",
              "POST",
              { id: t.id, accountId: t.source_id, amount: t.amount },
              t.user_id,
            );
            status = "reserved";
          } else if (status === "reserved") {
            status = "submitted";
          } else if (status === "submitted") {
            try {
              const result = await remote(
                "simulator",
                "/internal/settlements",
                "POST",
                { id: t.id, amount: t.amount, mode: t.mode },
              );
              status = result.status === "settled" ? "capturing" : "releasing";
            } catch {
              status = "reconciling";
            }
          } else if (status === "reconciling") {
            try {
              const result = await remote(
                "simulator",
                "/internal/settlements/" + t.id,
              );
              status = result.status === "settled" ? "capturing" : "releasing";
            } catch (e) {
              if (e instanceof RemoteError && e.status === 404)
                status = "submitted";
              else throw e;
            }
          } else if (status === "capturing") {
            await remote(
              "ledger",
              "/internal/holds/" + t.id + "/capture",
              "POST",
              {},
              t.user_id,
            );
            status = "settled";
          } else if (status === "releasing") {
            await remote(
              "ledger",
              "/internal/holds/" + t.id + "/release",
              "POST",
              {},
              t.user_id,
            );
            status = "rejected";
            error = "Contraparte recusou a operação simulada.";
          }
        } catch (e) {
          if (
            e instanceof RemoteError &&
            [400, 404, 409].includes(e.status) &&
            status === "requested"
          ) {
            status = "rejected";
            error = e.message;
          } else {
            error = (e as Error).message;
          }
        }
        await c.query(
          "UPDATE transfers SET status=$1,error=$2,updated_at=now() WHERE id=$3",
          [status, error, t.id],
        );
      });
    } catch (e) {
      console.error("saga", e);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
boot(TransfersController, work).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
