import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
export const id = (value: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(value))
    throw new HttpException("Identificador inválido.", 400);
  return value;
};
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      res = ctx.getResponse<Response>(),
      req = ctx.getRequest();
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof HttpException
          ? error.getStatus()
          : 500;
    const message =
      error instanceof ZodError
        ? "Dados inválidos. Verifique os campos."
        : error instanceof HttpException
          ? error.message
          : "Falha interna. Tente novamente.";
    if (status === 500)
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    res.status(status).json({ message, requestId: req.requestId });
  }
}
