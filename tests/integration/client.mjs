import assert from "node:assert/strict";
export const base = process.env.BASE_URL || "http://localhost:4104";
export class Client {
  cookie = "";
  csrf = "";
  async request(path, method = "GET", body, headers = {}) {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.cookie,
        "X-CSRF-Token": this.csrf,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await r.json();
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    if (value.csrf) this.csrf = value.csrf;
    return { status: r.status, value };
  }
  async login(email = "alice@example.test") {
    const r = await this.request("/auth/login", "POST", {
      email,
      password: process.env.DEMO_PASSWORD || "Demo1234!",
    });
    assert.equal(r.status, 201, JSON.stringify(r.value));
    return this;
  }
  async ok(path, method = "GET", body, headers = {}) {
    const r = await this.request(path, method, body, headers);
    assert.ok(r.status < 300, JSON.stringify(r));
    return r.value;
  }
}
