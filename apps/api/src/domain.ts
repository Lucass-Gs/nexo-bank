import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpException,
} from "@nestjs/common";
import { remote, RemoteError } from "./micro";
import { AuthRequest } from "./auth";
async function call(fn: () => Promise<any>) {
  try {
    return await fn();
  } catch (e) {
    throw new HttpException(
      e instanceof RemoteError
        ? e.message
        : "Serviço temporariamente indisponível.",
      e instanceof RemoteError ? e.status : 503,
    );
  }
}
@Controller("api/bank")
class BankController {
  @Get("accounts") accounts(@Req() r: AuthRequest) {
    return call(() =>
      remote("ledger", "/internal/accounts", "GET", undefined, r.user.id),
    );
  }
  @Post("accounts") create(@Req() r: AuthRequest) {
    return call(() =>
      remote(
        "ledger",
        "/internal/accounts",
        "POST",
        { name: r.user.name },
        r.user.id,
      ),
    );
  }
  @Get("beneficiaries") beneficiaries() {
    return call(() => remote("ledger", "/internal/beneficiaries"));
  }
  @Post("transfers") transfer(@Req() r: AuthRequest, @Body() body: unknown) {
    return call(() =>
      remote("transfers", "/internal/transfers", "POST", body, r.user.id),
    );
  }
  @Get("transfers") transfers(@Req() r: AuthRequest) {
    return call(() =>
      remote("transfers", "/internal/transfers", "GET", undefined, r.user.id),
    );
  }
  @Get("statement") statement(@Req() r: AuthRequest) {
    return call(() =>
      remote("statements", "/internal/statement", "GET", undefined, r.user.id),
    );
  }
  @Get("reconciliation") reconcile(@Req() r: AuthRequest) {
    if (r.user.role !== "admin")
      throw new HttpException("Somente operadores.", 403);
    return call(() => remote("ledger", "/internal/reconciliation"));
  }
}
@Module({ controllers: [BankController] })
export class DomainModule {}
