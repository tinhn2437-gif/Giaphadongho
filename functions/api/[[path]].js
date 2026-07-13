const ADMIN_COOKIE = "family_admin";
const VIEWER_COOKIE = "family_viewer";
const FAMILY_ROW_ID = "main";
const PASSWORD_ITERATIONS = 8000;
const DEFAULT_FAMILY_NAME = "Gia phả dòng họ Nguyễn Hữu";
const D1_FREE_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;
const D1_DATABASE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const R2_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;
const PHOTO_DATA_URL_LIMIT = 1600000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

function normalizedChoiceKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEducationLevel(value) {
  const key = normalizedChoiceKey(value);
  if (key === "pho thong") return "Phổ thông";
  if (key === "cao dang") return "Cao đẳng";
  if (key === "dai hoc") return "Đại học";
  return "";
}

function normalizeAcademicTitle(value) {
  const key = normalizedChoiceKey(value);
  if (key === "thac si") return "Thạc sĩ";
  if (key === "tien si") return "Tiến sĩ";
  if (key === "pgs" || key === "pho giao su" || key === "pho giao su pgs") return "PGS";
  if (key === "gs" || key === "giao su" || key === "giao su gs") return "GS";
  return "";
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

function bytesFromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function publicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
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
  return env.DB.prepare("SELECT id, username, display_name, COALESCE(role, 'viewer') AS role, password_hash, salt, iterations FROM users WHERE username = ?")
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
  await pruneUnusedPhotos(env, next);
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
    educationLevel: normalizeEducationLevel(payload.educationLevel),
    academicTitle: normalizeAcademicTitle(payload.academicTitle),
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

function parsePhotoDataUrl(dataUrl) {
  const value = clean(dataUrl);
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  if (value.length > PHOTO_DATA_URL_LIMIT) {
    throw publicError("Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn hoặc giảm dung lượng ảnh trước khi tải lên.", 400);
  }
  return { contentType: match[1], data: match[2] };
}

async function storePhotoDataUrl(env, dataUrl) {
  const parsed = parsePhotoDataUrl(dataUrl);
  if (!parsed) throw publicError("Ảnh không hợp lệ.", 400);
  const id = randomId("photo");
  await env.DB.prepare(
    "INSERT INTO photos (id, content_type, data, created_at) VALUES (?, ?, ?, ?)",
  ).bind(id, parsed.contentType, parsed.data, new Date().toISOString()).run();
  return `/api/photos/${id}`;
}

async function ensureExternalPersonPhotos(env, person) {
  if (String(person.photo || "").startsWith("data:image/")) {
    person.photo = await storePhotoDataUrl(env, person.photo);
  }
  const gallery = [];
  for (const url of cleanArray(person.galleryPhotos)) {
    gallery.push(String(url).startsWith("data:image/") ? await storePhotoDataUrl(env, url) : url);
  }
  person.galleryPhotos = [...new Set(gallery)];
  return person;
}

function referencedPhotoIds(data) {
  const ids = new Set();
  const add = (url) => {
    const match = String(url || "").match(/^\/api\/photos\/([^/?#]+)/);
    if (match) ids.add(match[1]);
  };
  (Array.isArray(data.people) ? data.people : []).forEach((person) => {
    add(person.photo);
    cleanArray(person.galleryPhotos).forEach(add);
  });
  return ids;
}

async function pruneUnusedPhotos(env, data) {
  const keep = referencedPhotoIds(data);
  const rows = await env.DB.prepare("SELECT id FROM photos").all();
  const unused = (rows.results || []).map((row) => row.id).filter((id) => !keep.has(id));
  for (const id of unused) {
    await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
  }
}

function familyDiagnostics(data) {
  const findings = [];
  const people = Array.isArray(data.people) ? data.people : [];
  const seen = new Map();
  people.forEach((person) => {
    if (!clean(person.id)) findings.push({ type: "missing-id", name: clean(person.fullName) });
    if (!clean(person.fullName)) findings.push({ type: "missing-name", id: clean(person.id) });
    if (seen.has(person.id)) findings.push({ type: "duplicate-id", id: person.id, firstName: seen.get(person.id), name: person.fullName });
    if (person.id) seen.set(person.id, person.fullName);
  });
  const byId = new Map(people.map((person) => [person.id, person]));
  people.forEach((person) => {
    ["fatherId", "motherId"].forEach((field) => {
      if (person[field] && !byId.has(person[field])) findings.push({ type: "bad-parent", name: person.fullName, field, id: person[field] });
      if (person[field] && person[field] === person.id) findings.push({ type: "self-parent", name: person.fullName, field });
    });
    cleanArray(person.spouseIds).forEach((spouseId) => {
      const spouse = byId.get(spouseId);
      if (!spouse) findings.push({ type: "bad-spouse", name: person.fullName, id: spouseId });
      else if (!cleanArray(spouse.spouseIds).includes(person.id)) findings.push({ type: "one-way-spouse", name: person.fullName, spouseName: spouse.fullName });
    });
    [person.photo, ...cleanArray(person.galleryPhotos)].forEach((url) => {
      if (String(url || "").startsWith("data:image/")) findings.push({ type: "embedded-photo", name: person.fullName });
    });
  });
  return findings;
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
  return !!await adminSession(request, env);
}

async function adminSession(request, env) {
  const username = normalizeUsername(await readSignedCookie(request, env, ADMIN_COOKIE, "admin"));
  if (!username) return null;
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (username === rootUsername) {
    return { username: rootUsername, displayName: "Admin gốc", role: "admin", isRoot: true };
  }
  const user = await getUser(env, username);
  if (!user || user.role !== "admin") return null;
  return {
    username: user.username,
    displayName: user.display_name,
    role: "admin",
    isRoot: false,
  };
}

async function viewerUser(request, env) {
  const admin = await adminSession(request, env);
  if (admin) return { username: admin.username, display_name: admin.displayName, role: "admin" };
  const username = await readSignedCookie(request, env, VIEWER_COOKIE, "viewer");
  if (!username) return null;
  return getUser(env, normalizeUsername(username));
}

async function handleAdminLogin(request, env) {
  const payload = await bodyJson(request);
  const username = normalizeUsername(payload.username);
  const password = clean(payload.password);
  const adminUser = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  const adminPassword = env.FAMILY_ADMIN_PASSWORD || "";
  let displayName = "Admin gốc";
  if (username === adminUser) {
    if (!adminPassword || password !== adminPassword) {
      return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
    }
  } else {
    const user = await getUser(env, username);
    if (!user || user.role !== "admin") return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
    const expected = await passwordHash(password, fromBase64Url(user.salt), user.iterations || PASSWORD_ITERATIONS);
    if (expected !== user.password_hash) return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
    displayName = user.display_name;
  }
  const token = await signPayload(env, {
    scope: "admin",
    user: username,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });
  return json({ ok: true, user: { username, displayName, role: "admin" } }, 200, { "Set-Cookie": makeCookie(ADMIN_COOKIE, token, 604800) });
}

async function createUserAccount(env, payload) {
  const username = normalizeUsername(payload.username);
  const password = clean(payload.password);
  const displayName = clean(payload.displayName).slice(0, 80) || username;
  const role = clean(payload.role) === "admin" ? "admin" : "viewer";
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (username.length < 3) return { error: "Tài khoản cần từ 3 ký tự trở lên.", status: 400 };
  if (password.length < 6) return { error: "Mật khẩu cần từ 6 ký tự trở lên.", status: 400 };
  if (username === rootUsername) return { error: "Không thể tạo trùng tài khoản admin gốc.", status: 409 };
  if (await getUser(env, username)) return { error: "Tài khoản này đã tồn tại.", status: 409 };

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, role, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    randomId("u"),
    username,
    displayName,
    role,
    hash,
    base64Url(salt),
    PASSWORD_ITERATIONS,
    new Date().toISOString(),
  ).run();

  return { user: { username, displayName, role }, status: 201 };
}

async function handleRegister() {
  return json({ error: "Tài khoản xem gia phả do admin tạo." }, 403);
}

async function handleAdminUsersList(request, env) {
  const admin = await adminSession(request, env);
  if (!admin) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  const result = await env.DB.prepare(
    "SELECT username, display_name, COALESCE(role, 'viewer') AS role, created_at FROM users ORDER BY created_at DESC",
  ).all();
  return json({
    currentUser: { username: admin.username, isRoot: admin.isRoot },
    users: [
      {
        username: rootUsername,
        displayName: "Admin gốc",
        role: "admin",
        locked: true,
        isRoot: true,
        createdAt: "",
      },
      ...(result.results || []).map((user) => ({
        username: user.username,
        displayName: user.display_name,
        role: user.role || "viewer",
        locked: false,
        isRoot: false,
        createdAt: user.created_at,
      })),
    ],
  });
}

async function handleAdminUsersCreate(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const result = await createUserAccount(env, await bodyJson(request));
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, user: result.user }, result.status);
}

async function handleAdminUsersUpdate(request, env, username) {
  const admin = await adminSession(request, env);
  if (!admin) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const cleanUsername = normalizeUsername(username);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (!cleanUsername) return json({ error: "Thiếu tài khoản cần sửa." }, 400);
  if (cleanUsername === rootUsername) return json({ error: "Không thể sửa tài khoản admin gốc." }, 403);

  const user = await getUser(env, cleanUsername);
  if (!user) return json({ error: "Không tìm thấy tài khoản." }, 404);
  const payload = await bodyJson(request);
  const displayName = clean(payload.displayName).slice(0, 80) || cleanUsername;
  const role = clean(payload.role) === "admin" ? "admin" : "viewer";
  if (admin.username === cleanUsername && user.role === "admin" && role !== "admin") {
    return json({ error: "Không thể tự hạ quyền tài khoản đang đăng nhập." }, 400);
  }

  const password = clean(payload.password);
  if (password) {
    if (password.length < 6) return json({ error: "Mật khẩu cần từ 6 ký tự trở lên." }, 400);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, role = ?, password_hash = ?, salt = ?, iterations = ? WHERE username = ?",
    ).bind(displayName, role, hash, base64Url(salt), PASSWORD_ITERATIONS, cleanUsername).run();
  } else {
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, role = ? WHERE username = ?",
    ).bind(displayName, role, cleanUsername).run();
  }

  return json({ ok: true, user: { username: cleanUsername, displayName, role } });
}

async function handleAdminUsersDelete(request, env, username) {
  const admin = await adminSession(request, env);
  if (!admin) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const cleanUsername = normalizeUsername(username);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (!cleanUsername) return json({ error: "Thiếu tài khoản cần xóa." }, 400);
  if (cleanUsername === rootUsername) return json({ error: "Không thể xóa tài khoản admin gốc." }, 403);
  if (cleanUsername === admin.username) return json({ error: "Không thể xóa tài khoản đang đăng nhập." }, 400);
  await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(cleanUsername).run();
  return json({ ok: true });
}

async function handleAdminStorage(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const family = await env.DB.prepare(
    "SELECT COALESCE(SUM(LENGTH(json)), 0) AS bytes, COUNT(*) AS rows FROM family_data",
  ).first();
  const photos = await env.DB.prepare(
    "SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes, COUNT(*) AS count FROM photos",
  ).first();
  const users = await env.DB.prepare(
    "SELECT COALESCE(SUM(LENGTH(username) + LENGTH(display_name) + LENGTH(password_hash) + LENGTH(salt) + LENGTH(COALESCE(role, 'viewer'))), 0) AS bytes, COUNT(*) AS count FROM users",
  ).first();
  const familyBytes = Number(family?.bytes || 0);
  const photoBytes = Number(photos?.bytes || 0);
  const userBytes = Number(users?.bytes || 0);
  const usedBytes = familyBytes + photoBytes + userBytes;
  return json({
    provider: "Cloudflare D1",
    estimated: true,
    usedBytes,
    freeQuotaBytes: D1_FREE_STORAGE_BYTES,
    databaseLimitBytes: D1_DATABASE_LIMIT_BYTES,
    remainingFreeBytes: Math.max(0, D1_FREE_STORAGE_BYTES - usedBytes),
    usedPercent: D1_FREE_STORAGE_BYTES ? Math.min(100, usedBytes / D1_FREE_STORAGE_BYTES * 100) : 0,
    parts: {
      familyBytes,
      photoBytes,
      userBytes,
      peopleCount: (await readFamily(env)).people.length,
      photoCount: Number(photos?.count || 0),
      accountCount: Number(users?.count || 0) + 1,
    },
    notes: {
      d1Free: "D1 miễn phí: 5 GB tổng dung lượng lưu trữ.",
      d1DatabaseLimit: "Mỗi D1 database tối đa 10 GB.",
      r2Free: "R2 miễn phí: 10 GB-month/tháng nếu chuyển ảnh sang R2.",
      estimate: "Số đang dùng là ước tính từ dữ liệu trong bảng, có thể thấp hơn số Cloudflare Dashboard vì chưa tính overhead nội bộ.",
    },
    r2FreeQuotaBytes: R2_FREE_STORAGE_BYTES,
  });
}

async function handleAdminDiagnostics(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const data = await readFamily(env);
  return json({
    ok: true,
    peopleCount: data.people.length,
    findings: familyDiagnostics(data),
  });
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
  const person = await ensureExternalPersonPhotos(env, normalizePerson(await bodyJson(request)));
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
  const updated = await ensureExternalPersonPhotos(env, normalizePerson(await bodyJson(request), id));
  if (!updated.fullName) return json({ error: "Vui lòng nhập họ tên." }, 400);
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
    people: await Promise.all(payload.people
      .filter((person) => person && typeof person === "object" && clean(person.fullName))
      .map((person) => ensureExternalPersonPhotos(env, normalizePerson(person)))),
  };
  return json(await writeFamily(env, data));
}

async function handlePhoto(request, env) {
  if (!await isAdmin(request, env)) return json({ error: "Bạn cần đăng nhập admin." }, 401);
  const payload = await bodyJson(request);
  const dataUrl = clean(payload.dataUrl);
  return json({ url: await storePhotoDataUrl(env, dataUrl) });
}

async function handlePhotoGet(request, env, id) {
  const user = await viewerUser(request, env);
  if (!user) return json({ error: "Bạn cần đăng nhập để xem ảnh." }, 401);
  const row = await env.DB.prepare("SELECT content_type, data FROM photos WHERE id = ?").bind(clean(id)).first();
  if (!row) return json({ error: "Không tìm thấy ảnh." }, 404);
  return new Response(bytesFromBase64(row.data), {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "private, max-age=86400",
    },
  });
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
    if (method === "GET" && path === "admin/storage") return handleAdminStorage(request, env);
    if (method === "GET" && path === "admin/diagnostics") return handleAdminDiagnostics(request, env);
    if (method === "GET" && path === "admin/users") return handleAdminUsersList(request, env);
    if (method === "POST" && path === "admin/users") return handleAdminUsersCreate(request, env);
    if (method === "PUT" && parts[0] === "admin" && parts[1] === "users" && parts[2]) return handleAdminUsersUpdate(request, env, decodeURIComponent(parts[2]));
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
    if (method === "GET" && parts[0] === "photos" && parts[1]) return handlePhotoGet(request, env, decodeURIComponent(parts[1]));

    return json({ error: "Không tìm thấy." }, 404);
  } catch (error) {
    if (error?.expose) return json({ error: error.message }, error.status || 400);
    const code = randomId("err");
    console.error(code, error?.stack || error?.message || error);
    return json({ error: `Lỗi máy chủ. Mã lỗi: ${code}` }, 500);
  }
}
