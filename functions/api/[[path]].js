const ADMIN_COOKIE = "family_admin";
const VIEWER_COOKIE = "family_viewer";
const FAMILY_ROW_ID = "main";
const PASSWORD_ITERATIONS = 8000;
const DEFAULT_FAMILY_NAME = "Gia phả dòng họ Nguyễn Hữu";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function clean(value) {
  return String(value || "").trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean);
}

function normalizeUsername(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "")
    .toLowerCase()
    .slice(0, 40);
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

function randomId(prefix) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${base64Url(bytes).slice(0, 12)}`;
}

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

async function signPayload(env, payload) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(env.AUTH_SECRET || "change-this-secret", body);
  return `${body}.${sig}`;
}

async function readSignedCookie(request, env, cookieName, scope) {
  const token = parseCookies(request)[cookieName];
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (await hmac(env.AUTH_SECRET || "change-this-secret", body) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (payload.scope !== scope || !payload.user || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.user;
  } catch (error) {
    return null;
  }
}

function makeCookie(name, token, maxAge) {
  return `${name}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly; Secure`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`;
}

async function passwordHash(password, saltBytes, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return base64Url(new Uint8Array(bits));
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

async function getUser(env, username) {
  return env.DB.prepare("SELECT id, username, display_name, password_hash, salt, iterations FROM users WHERE username = ?")
    .bind(username)
    .first();
}

async function readFamily(env) {
  const row = await env.DB.prepare("SELECT json FROM family_data WHERE id = ?").bind(FAMILY_ROW_ID).first();
  if (!row) return { familyName: DEFAULT_FAMILY_NAME, people: [] };
  const data = JSON.parse(row.json);
  data.familyName = clean(data.familyName) || DEFAULT_FAMILY_NAME;
  data.people = Array.isArray(data.people) ? data.people : [];
  return data;
}

async function writeFamily(env, data) {
  const next = {
    familyName: clean(data.familyName) || DEFAULT_FAMILY_NAME,
    updatedAt: new Date().toISOString(),
    people: Array.isArray(data.people) ? data.people : [],
  };
  normalizeRelationships(next);
  await env.DB.prepare(
    "INSERT INTO family_data (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
  ).bind(FAMILY_ROW_ID, JSON.stringify(next), next.updatedAt).run();
  return next;
}

function normalizePerson(payload, existingId = "") {
  const person = {
    id: existingId || clean(payload.id) || randomId("p"),
    fullName: clean(payload.fullName),
    gender: clean(payload.gender) || "Khác",
    birthDate: clean(payload.birthDate),
    deathDate: clean(payload.deathDate),
    marriageYear: clean(payload.marriageYear),
    familyRole: clean(payload.familyRole) || "Khác",
    hometown: clean(payload.hometown),
    currentResidence: clean(payload.currentResidence),
    daughterInLawFather: clean(payload.daughterInLawFather),
    daughterInLawMother: clean(payload.daughterInLawMother),
    daughterHusbandName: clean(payload.daughterHusbandName),
    daughterMarriedAddress: clean(payload.daughterMarriedAddress),
    daughterChildrenCount: clean(payload.daughterChildrenCount),
    address: clean(payload.address),
    job: clean(payload.job),
    achievements: cleanArray(payload.achievements),
    fatherId: clean(payload.fatherId),
    motherId: clean(payload.motherId),
    spouseIds: cleanArray(payload.spouseIds),
    photo: clean(payload.photo),
    galleryPhotos: cleanArray(payload.galleryPhotos),
    notes: clean(payload.notes),
  };
  if (person.familyRole !== "Con gái") {
    person.daughterHusbandName = "";
    person.daughterMarriedAddress = "";
    person.daughterChildrenCount = "";
  }
  return person;
}

function normalizeRelationships(data) {
  const people = Array.isArray(data.people) ? data.people : [];
  const idSet = new Set(people.map((person) => clean(person.id)).filter(Boolean));
  people.forEach((person) => {
    person.id = clean(person.id) || randomId("p");
    if (person.fatherId === person.id || !idSet.has(person.fatherId)) person.fatherId = "";
    if (person.motherId === person.id || !idSet.has(person.motherId)) person.motherId = "";
    person.spouseIds = [...new Set(cleanArray(person.spouseIds))]
      .filter((id) => id !== person.id && idSet.has(id));
  });

  const byId = new Map(people.map((person) => [person.id, person]));
  people.forEach((person) => {
    person.spouseIds.forEach((spouseId) => {
      const spouse = byId.get(spouseId);
      if (spouse && !spouse.spouseIds.includes(person.id)) {
        spouse.spouseIds.push(person.id);
      }
    });
  });
}

async function isAdmin(request, env) {
  const username = await readSignedCookie(request, env, ADMIN_COOKIE, "admin");
  return username === (env.FAMILY_ADMIN_USER || "admin");
}

async function viewerUser(request, env) {
  const admin = await isAdmin(request, env);
  if (admin) return { username: env.FAMILY_ADMIN_USER || "admin", display_name: "Admin" };
  const username = await readSignedCookie(request, env, VIEWER_COOKIE, "viewer");
  if (!username) return null;
  return getUser(env, normalizeUsername(username));
}

async function handleAdminLogin(request, env) {
  const payload = await bodyJson(request);
  const username = clean(payload.username);
  const password = clean(payload.password);
  const adminUser = env.FAMILY_ADMIN_USER || "admin";
  const adminPassword = env.FAMILY_ADMIN_PASSWORD || "";
  if (username !== adminUser || password !== adminPassword) {
    return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
  }
  const token = await signPayload(env, {
    scope: "admin",
    user: adminUser,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });
  return json({ ok: true }, 200, { "Set-Cookie": makeCookie(ADMIN_COOKIE, token, 604800) });
}

async function createViewerUser(env, payload) {
  const username = normalizeUsername(payload.username);
  const password = clean(payload.password);
  const displayName = clean(payload.displayName).slice(0, 80) || username;
  if (username.length < 3) return { error: "Tài khoản cần từ 3 ký tự trở lên.", status: 400 };
  if (password.length < 6) return { error: "Mật khẩu cần từ 6 ký tự trở lên.", status: 400 };
  if (await getUser(env, username)) return { error: "Tài khoản này đã tồn tại.", status: 409 };

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    randomId("u"),
    username,
    displayName,
    hash,
    base64Url(salt),
    PASSWORD_ITERATIONS,
    new Date().toISOString(),
  ).run();

  return { user: { username, displayName }, status: 201 };
}

async function handleRegister() {
  return json({ error: "Tài khoản xem gia phả do admin tạo." }, 403);
}

async function handleAdminUsersList(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const result = await env.DB.prepare(
    "SELECT username, display_name, created_at FROM users ORDER BY created_at DESC",
  ).all();
  return json({
    users: (result.results || []).map((user) => ({
      username: user.username,
      displayName: user.display_name,
      createdAt: user.created_at,
    })),
  });
}

async function handleAdminUsersCreate(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const result = await createViewerUser(env, await bodyJson(request));
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, user: result.user }, result.status);
}

async function handleAdminUsersDelete(request, env, username) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) return json({ error: "Thiếu tài khoản cần xóa." }, 400);
  await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(cleanUsername).run();
  return json({ ok: true });
}

async function handleViewerLogin(request, env) {
  const payload = await bodyJson(request);
  const username = normalizeUsername(payload.username);
  const password = clean(payload.password);
  const user = await getUser(env, username);
  if (!user) return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
  const expected = await passwordHash(password, fromBase64Url(user.salt), user.iterations || PASSWORD_ITERATIONS);
  if (expected !== user.password_hash) return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
  return sendViewerLogin(env, username, {
    ok: true,
    user: { username: user.username, displayName: user.display_name },
  });
}

async function sendViewerLogin(env, username, data, status = 200) {
  const token = await signPayload(env, {
    scope: "viewer",
    user: username,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
  return json(data, status, { "Set-Cookie": makeCookie(VIEWER_COOKIE, token, 2592000) });
}

async function handleMe(request, env) {
  return json({ authenticated: await isAdmin(request, env) });
}

async function handleViewerSession(request, env) {
  const user = await viewerUser(request, env);
  return json({
    authenticated: !!user,
    user: user ? { username: user.username, displayName: user.display_name } : null,
    registrationEnabled: false,
  });
}

async function handlePeopleGet(request, env) {
  const user = await viewerUser(request, env);
  if (!user) return json({ error: "Bạn cần đăng nhập để xem gia phả." }, 401);
  return json(await readFamily(env));
}

async function handlePeopleCreate(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const person = normalizePerson(await bodyJson(request));
  if (!person.fullName) return json({ error: "Vui lòng nhập họ tên." }, 400);
  const data = await readFamily(env);
  data.people.push(person);
  await writeFamily(env, data);
  return json(person, 201);
}

async function handlePeopleUpdate(request, env, id) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const data = await readFamily(env);
  const index = data.people.findIndex((person) => person.id === id);
  if (index < 0) return json({ error: "Không tìm thấy người này." }, 404);
  const updated = normalizePerson(await bodyJson(request), id);
  const selectedSpouses = new Set(updated.spouseIds);
  data.people.forEach((person) => {
    if (!selectedSpouses.has(person.id)) {
      person.spouseIds = cleanArray(person.spouseIds).filter((spouseId) => spouseId !== id);
    }
  });
  data.people[index] = updated;
  await writeFamily(env, data);
  return json(updated);
}

async function handlePeopleDelete(request, env, id) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const data = await readFamily(env);
  const before = data.people.length;
  data.people = data.people.filter((person) => person.id !== id);
  if (data.people.length === before) return json({ error: "Không tìm thấy người này." }, 404);
  data.people.forEach((person) => {
    if (person.fatherId === id) person.fatherId = "";
    if (person.motherId === id) person.motherId = "";
    person.spouseIds = cleanArray(person.spouseIds).filter((spouseId) => spouseId !== id);
  });
  await writeFamily(env, data);
  return json({ ok: true });
}

async function handleImport(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const payload = await bodyJson(request);
  if (!Array.isArray(payload.people)) return json({ error: "File nhập phải có danh sách people." }, 400);
  const data = {
    familyName: clean(payload.familyName) || DEFAULT_FAMILY_NAME,
    people: payload.people
      .filter((person) => person && typeof person === "object" && clean(person.fullName))
      .map((person) => normalizePerson(person)),
  };
  return json(await writeFamily(env, data));
}

async function handlePhoto(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const payload = await bodyJson(request);
  const dataUrl = clean(payload.dataUrl);
  if (!dataUrl.startsWith("data:image/") || !dataUrl.includes(",")) {
    return json({ error: "Ảnh không hợp lệ." }, 400);
  }
  if (dataUrl.length > 1400000) {
    return json({ error: "Ảnh quá lớn. Bản miễn phí hiện chỉ nhận ảnh nhỏ hơn khoảng 1MB, hoặc dán link ảnh vào ô ảnh." }, 400);
  }
  return json({ url: dataUrl });
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname.replace(/^\/+/, "").replace(/^api\/?/, "").replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);

    if (method === "GET" && path === "viewer-session") return handleViewerSession(request, env);
    if (method === "GET" && path === "me") return handleMe(request, env);
    if (method === "GET" && path === "admin/users") return handleAdminUsersList(request, env);
    if (method === "POST" && path === "admin/users") return handleAdminUsersCreate(request, env);
    if (method === "DELETE" && parts[0] === "admin" && parts[1] === "users" && parts[2]) return handleAdminUsersDelete(request, env, decodeURIComponent(parts[2]));
    if (method === "POST" && path === "login") return handleAdminLogin(request, env);
    if (method === "POST" && path === "logout") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(ADMIN_COOKIE) } });
    }
    if (method === "POST" && path === "register") return handleRegister(request, env);
    if (method === "POST" && path === "view-login") return handleViewerLogin(request, env);
    if (method === "POST" && path === "view-logout") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(VIEWER_COOKIE) } });
    }
    if (method === "GET" && path === "people") return handlePeopleGet(request, env);
    if (method === "POST" && path === "people") return handlePeopleCreate(request, env);
    if (method === "PUT" && parts[0] === "people" && parts[1]) return handlePeopleUpdate(request, env, decodeURIComponent(parts[1]));
    if (method === "DELETE" && parts[0] === "people" && parts[1]) return handlePeopleDelete(request, env, decodeURIComponent(parts[1]));
    if (method === "POST" && path === "import") return handleImport(request, env);
    if (method === "POST" && path === "photos") return handlePhoto(request, env);

    return json({ error: "Không tìm thấy." }, 404);
  } catch (error) {
    return json({ error: "Server error" }, 500);
  }
}
