/**
 * Yerel SAHTE iyzico sunucusu — yalnız geliştirme ve uçtan uca deneme. Sandbox'ın yerini TUTMAZ:
 * iyzico'nun dokümandaki istek/yanıt biçimini taklit eder (tests/helpers/fake-iyzico.ts), gerçek
 * iyzico davranışını kanıtlamaz (docs/IYZICO_SANDBOX_TEST.md).
 *
 *   npx tsx scripts/dev/fake-iyzico-server.ts [--port 3299]
 *
 * Siteyi bu ortamla başlatın (yalnız yerel; gerçek anahtar KULLANMAYIN):
 *   PAYMENT_PROVIDER=iyzico IYZICO_API_KEY=test-api-key IYZICO_SECRET_KEY=test-secret-key
 *   IYZICO_BASE_URL=http://127.0.0.1:3299
 *
 * Ödeme sayfası (/pay?token=…): "Öde ve siteye dön" (callback), "Öde, siteye dönme" (callback kaybı),
 * "Kart reddedildi". Webhook göndermez: scripts/iyzico-webhook-sim.ts ile gönderilir.
 */

import http from "node:http";
import { FakeIyzico, FAKE_BASE_URL } from "../../tests/helpers/fake-iyzico";

const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 3299;
const fake = new FakeIyzico({ paymentPageBase: `http://127.0.0.1:${port}/pay` });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px;color:#222}
button{display:block;width:100%;margin:8px 0;padding:12px;font-size:15px;cursor:pointer}
.n{color:#b45309;font-size:13px}</style></head><body>${body}</body></html>`;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/payment/")) {
      const body = await readBody(req);
      const r = await fake.handleFetch(FAKE_BASE_URL + url.pathname, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body,
      });
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(await r.text());
      return;
    }

    if (url.pathname === "/pay" && req.method === "GET") {
      const token = url.searchParams.get("token") ?? "";
      const p = fake.payments.get(token);
      if (!p) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Bulunamadı", "<p>Token bulunamadı.</p>"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        page(
          "Sahte iyzico ödeme sayfası",
          `<h1>Sahte iyzico</h1><p class="n">Yerel deneme sunucusu — gerçek ödeme yok.</p>
<p>Tutar: <strong>${esc(p.price)} ${esc(p.currency)}</strong><br>Sepet: ${esc(p.basketId)}</p>
<form method="post" action="/pay"><input type="hidden" name="token" value="${esc(token)}">
<button name="action" value="return">Öde ve siteye dön</button>
<button name="action" value="noreturn">Öde, siteye dönme (callback kaybı)</button>
<button name="action" value="decline">Kart reddedildi</button></form>`
        )
      );
      return;
    }

    if (url.pathname === "/pay" && req.method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      const token = form.get("token") ?? "";
      const action = form.get("action");
      const p = fake.payments.get(token);
      if (!p) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Bulunamadı", "<p>Token bulunamadı.</p>"));
        return;
      }
      if (action === "decline") fake.fail(token);
      else fake.pay(token);
      if (action === "noreturn") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Ödendi", `<p>Ödendi (ödeme no ${esc(p.paymentId ?? "")}). Siteye dönülmedi.</p>`));
        return;
      }
      // iyzico gibi: tarayıcı callbackUrl'e token'ı POST eder
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        page(
          "Yönlendiriliyor",
          `<form id="f" method="post" action="${esc(p.callbackUrl ?? "")}"><input type="hidden" name="token" value="${esc(token)}"></form>
<script>document.getElementById("f").submit()</script>`
        )
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("bulunamadı");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(err));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sahte iyzico: http://127.0.0.1:${port} (yalnız yerel deneme)`);
});
