const ADMIN_COOKIE = "family_admin";
const VIEWER_COOKIE = "family_viewer";

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
    }));
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function signedUser(request, env, cookieName, scope) {
  const token = parseCookies(request)[cookieName];
  if (!token || !token.includes(".")) return "";
  const [body, signature] = token.split(".");
  if (await hmac(env.AUTH_SECRET || "change-this-secret", body) !== signature) return "";
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (payload.scope !== scope || !payload.user || payload.exp <= Math.floor(Date.now() / 1000)) return "";
    return String(payload.user).toLowerCase();
  } catch (error) {
    return "";
  }
}

async function canViewUploads(request, env) {
  const admin = await signedUser(request, env, ADMIN_COOKIE, "admin");
  const rootAdmin = String(env.FAMILY_ADMIN_USER || "admin").toLowerCase();
  if (admin === rootAdmin) return true;
  if (admin) {
    const row = await env.DB.prepare("SELECT role FROM users WHERE username = ?").bind(admin).first();
    if (row?.role === "admin") return true;
  }

  const viewer = await signedUser(request, env, VIEWER_COOKIE, "viewer");
  if (!viewer) return false;
  return !!await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(viewer).first();
}

export async function onRequest(context) {
  if (!await canViewUploads(context.request, context.env)) {
    return new Response("Bạn cần đăng nhập để xem ảnh.", {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
