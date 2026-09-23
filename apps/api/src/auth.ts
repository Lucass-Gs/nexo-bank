import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { Db } from "./db";
const scrypt = promisify(scryptCallback);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(value: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await scrypt(value, salt, 64)) as Buffer).toString("hex")
  );
}
async function passwordMatches(value: string, hash: string) {
  const [salt, key] = hash.split(":");
  const test = (await scrypt(value, salt, 64)) as Buffer;
  return key.length === 128 && timingSafeEqual(Buffer.from(key, "hex"), test);
}
export type User = { id: string; name: string; email: string; role: string };
export type AuthRequest = Request & {
  user: User;
  sessionId: string;
  csrf: string;
};
@Injectable()
export class Auth {
  constructor(private readonly db: Db) {}
  async session(token: unknown) {
    if (typeof token !== "string" || token.length > 200) return null;
    return (
      (
        await this.db.query(
          'SELECT u.id,u.name,u.email,u.role,s.id AS "sessionId",s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
          [digest(token)],
        )
      ).rows[0] || null
    );
  }
  async require(req: AuthRequest) {
    const user = await this.session(req.cookies?.sid);
    if (!user) throw new UnauthorizedException("Entre para continuar.");
    req.user = user;
    req.sessionId = user.sessionId;
    req.csrf = user.csrf;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== user.csrf
    )
      throw new ForbiddenException("Token de segurança inválido.");
  }
  async login(email: string, password: string, res: Response) {
    const user = (
      await this.db.query("SELECT * FROM users WHERE email=$1", [
        email.toLowerCase(),
      ])
    ).rows[0];
    const fallback = "0123456789abcdef0123456789abcdef:" + "00".repeat(64);
    if (
      !(await passwordMatches(password, user?.password_hash || fallback)) ||
      !user
    )
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await this.db.query(
      "INSERT INTO sessions(user_id,token_hash,csrf) VALUES($1,$2,$3)",
      [user.id, digest(token), csrf],
    );
    res.cookie("sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 86400000,
    });
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      csrf,
    };
  }
}
const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(128),
});
@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly auth: Auth,
    private readonly db: Db,
  ) {}
  @Post("login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = credentials.parse(body);
    return this.auth.login(data.email, data.password, res);
  }
  @Post("register") async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = credentials
      .extend({ name: z.string().trim().min(2).max(80) })
      .parse(body);
    try {
      await this.db.query(
        "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3)",
        [
          data.name,
          data.email.toLowerCase(),
          await passwordHash(data.password),
        ],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new BadRequestException("E-mail já cadastrado.");
      throw e;
    }
    return this.auth.login(data.email, data.password, res);
  }
  @Get("me") me(@Req() req: AuthRequest) {
    return { user: req.user, csrf: req.csrf };
  }
  @Post("logout") async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.query("DELETE FROM sessions WHERE id=$1", [req.sessionId]);
    res.clearCookie("sid", { path: "/" });
    return { ok: true };
  }
}
