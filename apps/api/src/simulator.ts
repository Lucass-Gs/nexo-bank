import "./telemetry";
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { z } from "zod";
import { Db } from "./db";
import { boot } from "./micro";
import { amountSchema } from "./ledger";
@Controller("internal")
class Simulator {
  constructor(private readonly db: Db) {}
  @Post("settlements") async create(@Body() input: unknown) {
    const p = z
      .object({
        id: z.uuid(),
        amount: amountSchema,
        mode: z.enum(["success", "reject", "timeout"]),
      })
      .parse(input);
    const result = await this.db.query(
      "INSERT INTO settlements(id,amount,status,mode) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *",
      [p.id, p.amount, p.mode === "reject" ? "rejected" : "settled", p.mode],
    );
    const record =
      result.rows[0] ||
      (await this.db.query("SELECT * FROM settlements WHERE id=$1", [p.id]))
        .rows[0];
    if (record.amount !== p.amount || record.mode !== p.mode)
      throw new ConflictException("Operação divergente.");
    if (p.mode === "timeout" && result.rowCount)
      await new Promise((r) => setTimeout(r, 4000));
    return record;
  }
  @Get("settlements/:id") async find(@Param("id") id: string) {
    const value = (
      await this.db.query("SELECT * FROM settlements WHERE id=$1", [
        z.uuid().parse(id),
      ])
    ).rows[0];
    if (!value) throw new NotFoundException();
    return value;
  }
}
boot(Simulator).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
