import "./telemetry";
import { Controller, Get, Headers } from "@nestjs/common";
import { z } from "zod";
import { Db } from "./db";
import { boot } from "./micro";
import { consume } from "./messaging";
@Controller("internal")
class Projection {
  constructor(private readonly db: Db) {}
  @Get("statement") async list(@Headers("x-user-id") user: string) {
    return (
      await this.db.query(
        "SELECT * FROM statements WHERE owner_id=$1 ORDER BY entry_id DESC LIMIT 100",
        [z.uuid().parse(user)],
      )
    ).rows;
  }
  @Get("metrics") async metrics() {
    return {
      events: Number(
        (await this.db.query("SELECT count(*) FROM inbox")).rows[0].count,
      ),
    };
  }
}
boot(Projection, (db) =>
  consume(db, process.env.SERVICE_NAME === "notifications"),
).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
