import "./telemetry";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module, Controller, Get, Req } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { Db } from "./db";
import { Auth, AuthController, AuthRequest } from "./auth";
import { Errors } from "./common";
import { DomainModule } from "./domain";
@Controller("api")
class Health {
  constructor(private readonly db: Db) {}
  @Get("health") async health() {
    await this.db.query("SELECT 1");
    return { status: "ok", service: "nexo-bank" };
  }
}
@Module({
  imports: [DomainModule],
  controllers: [AuthController, Health],
  providers: [Db, Auth],
})
class AppModule {}
async function main() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  const auth = app.get(Auth);
  const limits = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    res.on("finish", () =>
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }),
      ),
    );
    if (["POST", "PATCH", "DELETE", "PUT"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        let host = "";
        try {
          host = new URL(origin).host;
        } catch {}
        if (host !== req.headers.host) {
          res.status(403).json({ message: "Origem não autorizada." });
          return;
        }
      }
    }
    if (req.path.startsWith("/api/auth/") && req.method === "POST") {
      const key = req.ip || "unknown";
      const now = Date.now();
      if (limits.size > 10000)
        for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      const bucket = limits.get(key);
      if (!bucket || bucket.until < now)
        limits.set(key, { count: 1, until: now + 60000 });
      else if (++bucket.count > 30) {
        res
          .status(429)
          .json({ message: "Muitas tentativas. Aguarde um minuto." });
        return;
      }
    }
    next();
  });
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.path.startsWith("/api") ||
      ["/api/health", "/api/auth/login", "/api/auth/register"].includes(
        req.path,
      )
    ) {
      next();
      return;
    }
    try {
      await auth.require(req as AuthRequest);
      next();
    } catch (e) {
      res
        .status((e as any).getStatus?.() || 500)
        .json({ message: (e as Error).message });
    }
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), "0.0.0.0");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
