/**
 * Sahte SMTP sunucusu (testler ve yerel uçtan uca deneme). Gerçek SMTP protokolünü konuşur (EHLO, AUTH,
 * MAIL FROM, RCPT TO, DATA), TLS yoktur; gelen e-postaları bellekte tutar. Hata taklidi:
 *  - rejectRecipients: bu adreslere RCPT TO → 550 (kalıcı hata)
 *  - tempFailRecipients: bu adreslere RCPT TO → 451 (geçici hata)
 *  - password: verilirse AUTH bu şifreyi ister (yanlışsa 535)
 * Hiçbir yere e-posta iletmez.
 */

import net from "node:net";

export interface ReceivedEmail {
  from: string;
  to: string[];
  raw: string;
  auth: { user: string; pass: string } | null;
  at: Date;
}

export interface FakeSmtpOptions {
  port?: number;
  host?: string;
  password?: string;
  rejectRecipients?: string[];
  tempFailRecipients?: string[];
  onMessage?: (msg: ReceivedEmail) => void;
}

const b64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

export class FakeSmtpServer {
  readonly received: ReceivedEmail[] = [];
  readonly opts: FakeSmtpOptions;
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();
  port = 0;

  constructor(opts: FakeSmtpOptions = {}) {
    this.opts = opts;
  }

  async start(): Promise<number> {
    this.server = net.createServer((socket) => this.handle(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.opts.port ?? 0, this.opts.host ?? "127.0.0.1", () => resolve());
    });
    this.port = (this.server!.address() as net.AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  /** Testte ortam değişkenlerini bu sunucuya çevirir */
  env(): Record<string, string> {
    return {
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(this.port),
      SMTP_SECURE: "false",
      SMTP_REQUIRE_TLS: "false",
      SMTP_USER: "siparis@ornek-magaza.test",
      SMTP_PASS: this.opts.password ?? "test-sifre",
      EMAIL_FROM: "Çiftçi Ece <siparis@ornek-magaza.test>",
    };
  }

  private handle(socket: net.Socket) {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    const write = (line: string) => socket.write(`${line}\r\n`);

    let buffer = "";
    let mode: "cmd" | "data" | "auth-plain" | "auth-login-user" | "auth-login-pass" = "cmd";
    let from = "";
    let to: string[] = [];
    let dataLines: string[] = [];
    let auth: { user: string; pass: string } | null = null;
    let loginUser = "";

    const checkAuth = (user: string, pass: string) => {
      if (this.opts.password !== undefined && pass !== this.opts.password) {
        write("535 5.7.8 Authentication credentials invalid");
        return;
      }
      auth = { user, pass };
      write("235 2.7.0 Authentication successful");
    };

    const onLine = (line: string) => {
      if (mode === "data") {
        if (line === ".") {
          const msg: ReceivedEmail = { from, to, raw: dataLines.join("\r\n"), auth, at: new Date() };
          this.received.push(msg);
          this.opts.onMessage?.(msg);
          dataLines = [];
          mode = "cmd";
          write(`250 2.0.0 Ok: queued as fake-${this.received.length}`);
        } else {
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        }
        return;
      }
      if (mode === "auth-plain") {
        const [, user = "", pass = ""] = b64(line).split("\u0000");
        mode = "cmd";
        return checkAuth(user, pass);
      }
      if (mode === "auth-login-user") {
        loginUser = b64(line);
        mode = "auth-login-pass";
        return write("334 UGFzc3dvcmQ6");
      }
      if (mode === "auth-login-pass") {
        mode = "cmd";
        return checkAuth(loginUser, b64(line));
      }

      const [verbRaw, ...rest] = line.split(" ");
      const verb = verbRaw.toUpperCase();
      const arg = rest.join(" ");
      switch (verb) {
        case "EHLO":
          socket.write("250-fake-smtp\r\n250-AUTH PLAIN LOGIN\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
          return;
        case "HELO":
          return write("250 fake-smtp");
        case "AUTH": {
          const [mech, initial] = arg.split(" ");
          if (mech?.toUpperCase() === "PLAIN") {
            if (initial) {
              const [, user = "", pass = ""] = b64(initial).split("\u0000");
              return checkAuth(user, pass);
            }
            mode = "auth-plain";
            return write("334 ");
          }
          if (mech?.toUpperCase() === "LOGIN") {
            mode = "auth-login-user";
            return write("334 VXNlcm5hbWU6");
          }
          return write("504 5.5.4 Unrecognized authentication type");
        }
        case "MAIL":
          from = /<([^>]*)>/.exec(arg)?.[1] ?? "";
          to = [];
          return write("250 2.1.0 Ok");
        case "RCPT": {
          const addr = (/<([^>]*)>/.exec(arg)?.[1] ?? "").toLowerCase();
          if (this.opts.rejectRecipients?.includes(addr)) return write("550 5.1.1 Recipient address rejected: User unknown");
          if (this.opts.tempFailRecipients?.includes(addr)) return write("451 4.3.0 Temporary failure, try again later");
          to.push(addr);
          return write("250 2.1.5 Ok");
        }
        case "DATA":
          if (to.length === 0) return write("554 5.5.1 No valid recipients");
          mode = "data";
          return write("354 End data with <CR><LF>.<CR><LF>");
        case "RSET":
          from = "";
          to = [];
          return write("250 2.0.0 Ok");
        case "NOOP":
          return write("250 2.0.0 Ok");
        case "QUIT":
          write("221 2.0.0 Bye");
          socket.end();
          return;
        default:
          return write("502 5.5.2 Error: command not recognized");
      }
    };

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        onLine(line);
      }
    });
    write("220 fake-smtp ESMTP");
  }
}

/** Ham e-postadan konu (RFC 2047 kodlu olabilir) */
export function subjectOf(raw: string): string {
  const m = /^Subject: (.*(?:\r\n[ \t].*)*)/im.exec(raw);
  if (!m) return "";
  return m[1]
    .replace(/\r\n[ \t]/g, " ")
    .replace(/=\?utf-8\?([bq])\?([^?]*)\?=\s*/gi, (_all, enc: string, data: string) =>
      enc.toUpperCase() === "B"
        ? Buffer.from(data, "base64").toString("utf8")
        : decodeQuotedPrintable(data.replace(/_/g, " "))
    )
    .trim();
}

export function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  const src = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "=" && /^[0-9A-F]{2}$/i.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(src[i], "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** multipart/alternative içinden istenen bölümü çözer (text/html ya da text/plain) */
export function partOf(raw: string, type: "text/html" | "text/plain"): string {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(raw)?.[1];
  const sections = boundary ? raw.split(`--${boundary}`) : [raw];
  for (const section of sections) {
    const headerEnd = section.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = section.slice(0, headerEnd);
    if (!new RegExp(`Content-Type: ${type.replace("/", "\\/")}`, "i").test(headers)) continue;
    const body = section.slice(headerEnd + 4);
    const enc = /Content-Transfer-Encoding: ([\w-]+)/i.exec(headers)?.[1]?.toLowerCase();
    if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    if (enc === "quoted-printable") return decodeQuotedPrintable(body);
    return body;
  }
  return "";
}
