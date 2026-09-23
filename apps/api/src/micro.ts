import "./telemetry";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Module, Controller, Get } from "@nestjs/common";
import { Db } from "./db";
import { Errors } from "./common";
import type { Request, Response, NextFunction } from "express";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
@Controller("api")
class Health {
  constructor(private readonly db: Db) {}
  @Get("health") async health() {
    await this.db.query("SELECT 1");
    return { status: "ok", service: process.env.SERVICE_NAME };
  }
}
export async function boot(controller: any, after?: (db: Db) => Promise<void>) {
  @Module({ controllers: [controller, Health], providers: [Db] })
  class Service {}
  const app = await NestFactory.create(Service);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id =
      typeof req.headers["x-request-id"] === "string"
        ? req.headers["x-request-id"]
        : randomUUID();
    (req as any).requestId = id;
    res.setHeader("X-Request-Id", id);
    res.on("finish", () =>
      console.log(
        JSON.stringify({
          service: process.env.SERVICE_NAME,
          requestId: id,
          path: req.path,
          status: res.statusCode,
        }),
      ),
    );
    if (req.path === "/api/health") {
      next();
      return;
    }
    const token = String(req.headers["x-service-token"] || ""),
      expected = process.env.SERVICE_TOKEN;
    if (
      !expected ||
      !timingSafeEqual(
        createHash("sha256").update(token).digest(),
        createHash("sha256").update(expected).digest(),
      )
    ) {
      res.status(401).json({ message: "Service authentication required" });
      return;
    }
    next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(3000, "0.0.0.0");
  if (after) {
    let running = true;
    process.once("SIGTERM", () => {
      running = false;
    });
    const db = app.get(Db);
    void (async () => {
      while (running) {
        try {
          await after(db);
          if (running) console.error("Background processor stopped; reconnecting.");
        } catch (error) {
          console.error("Background processor unavailable; retrying.", error);
        }
        if (running) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();
  }
}
export class RemoteError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function remote(
  service: string,
  path: string,
  method = "GET",
  data?: unknown,
  userId?: string,
) {
  const base =
    process.env[service.toUpperCase() + "_URL"] ||
    "http://" + service + ":3000";
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Service-Token": process.env.SERVICE_TOKEN || "",
      "X-User-Id": userId || "",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(1800),
  });
  const value = await res.json();
  if (!res.ok)
    throw new RemoteError(value.message || "Serviço indisponível", res.status);
  return value;
}
