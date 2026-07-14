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
    .toLowerCase()
    .replace(/đ/g, "d")
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

function normalizeAcademicDegree(value) {
  const key = normalizedChoiceKey(value);
  if (key === "cu nhan") return "Cử nhân";
  if (key === "thac si") return "Thạc sĩ";
  if (key === "tien si") return "Tiến sĩ";
  return "";
}

function normalizeAcademicRank(value) {
  const key = normalizedChoiceKey(value);
  if (key === "pgs" || key === "pho giao su" || key === "pho giao su pgs") return "PGS";
  if (key === "gs" || key === "giao su" || key === "giao su gs") return "GS";
  return "";
}

function academicDegreeFor(educationLevel, academicDegree) {
  if (academicDegree === "Cử nhân" && !["Cao đẳng", "Đại học"].includes(educationLevel)) return "";
  return academicDegree || (["Cao đẳng", "Đại học"].includes(educationLevel) ? "Cử nhân" : "");
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

function mutationOriginAllowed(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (error) {
    return false;
  }
}

async function getUser(env, username) {
  return env.DB.prepare("SELECT id, username, display_name, COALESCE(role, 'viewer') AS role, COALESCE(person_id, '') AS person_id, password_hash, salt, iterations FROM users WHERE username = ?")
    .bind(username)
    .first();
}

function normalizeAccountRole(value) {
  const role = clean(value);
  return ["viewer", "member", "clan_head", "admin"].includes(role) ? role : "viewer";
}

function publicSessionUser(user) {
  if (!user) return null;
  return {
    username: user.username,
    displayName: user.displayName || user.display_name || user.username,
    role: normalizeAccountRole(user.role),
    personId: clean(user.personId || user.person_id),
    isRoot: !!user.isRoot,
  };
}

async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first();
  return clean(row?.value);
}

async function setSetting(env, key, value) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).bind(key, clean(value), now).run();
}

async function readFamily(env) {
  const row = await env.DB.prepare("SELECT json FROM family_data WHERE id = ?").bind(FAMILY_ROW_ID).first();
  if (!row) return { familyName: DEFAULT_FAMILY_NAME, people: [] };
  const data = JSON.parse(row.json);
  data.familyName = clean(data.familyName) || DEFAULT_FAMILY_NAME;
  data.people = (Array.isArray(data.people) ? data.people : []).map((person) => {
    const educationLevel = normalizeEducationLevel(person.educationLevel);
    const legacyTitle = clean(person.academicTitle);
    const academicDegree = academicDegreeFor(
      educationLevel,
      normalizeAcademicDegree(person.academicDegree) || normalizeAcademicDegree(legacyTitle),
    );
    const academicRank = normalizeAcademicRank(person.academicRank) || normalizeAcademicRank(legacyTitle);
    return {
      ...person,
      educationLevel,
      academicDegree,
      academicRank,
      academicTitle: academicRank || academicDegree,
      graveLocation: clean(person.graveLocation),
      graveAddress: clean(person.graveAddress),
      graveMapUrl: clean(person.graveMapUrl),
      graveNotes: clean(person.graveNotes),
      gravePhoto: clean(person.gravePhoto),
    };
  });
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
  await reconcileAccountIdentities(env, next);
  await pruneUnusedPhotos(env, next);
  return next;
}

async function reconcileAccountIdentities(env, data) {
  const validIds = new Set((data.people || []).map((person) => person.id));
  const users = await env.DB.prepare("SELECT username, person_id FROM users WHERE person_id IS NOT NULL AND person_id <> ''").all();
  for (const user of users.results || []) {
    if (!validIds.has(user.person_id)) {
      await env.DB.prepare("UPDATE users SET person_id = NULL WHERE username = ?").bind(user.username).run();
    }
  }
  const rootPersonId = await getSetting(env, "root_person_id");
  if (rootPersonId && !validIds.has(rootPersonId)) await setSetting(env, "root_person_id", "");
}

function normalizePerson(payload, existingId = "") {
  const rawEducationLevel = clean(payload.educationLevel);
  const rawAcademicDegree = clean(payload.academicDegree);
  const rawAcademicRank = clean(payload.academicRank);
  const legacyTitle = clean(payload.academicTitle);
  const educationLevel = normalizeEducationLevel(rawEducationLevel);
  const normalizedAcademicDegree = normalizeAcademicDegree(rawAcademicDegree) || normalizeAcademicDegree(legacyTitle);
  const academicRank = normalizeAcademicRank(rawAcademicRank) || normalizeAcademicRank(legacyTitle);
  if (rawEducationLevel && !educationLevel) {
    throw publicError("Trình độ không hợp lệ. Vui lòng chọn lại trong danh sách.", 400);
  }
  if (rawAcademicDegree && !normalizeAcademicDegree(rawAcademicDegree)) {
    throw publicError("Học vị không hợp lệ. Vui lòng chọn lại trong danh sách.", 400);
  }
  if (rawAcademicRank && !normalizeAcademicRank(rawAcademicRank)) {
    throw publicError("Học hàm không hợp lệ. Vui lòng chọn lại trong danh sách.", 400);
  }
  if (legacyTitle && !normalizeAcademicDegree(legacyTitle) && !normalizeAcademicRank(legacyTitle)) {
    throw publicError("Học hàm/học vị cũ không hợp lệ. Vui lòng chọn lại trong danh sách.", 400);
  }
  const academicDegree = academicDegreeFor(educationLevel, normalizedAcademicDegree);
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
    educationLevel,
    academicDegree,
    academicRank,
    academicTitle: academicRank || academicDegree,
    achievements: cleanArray(payload.achievements),
    fatherId: clean(payload.fatherId),
    motherId: clean(payload.motherId),
    spouseIds: cleanArray(payload.spouseIds),
    photo: clean(payload.photo),
    galleryPhotos: cleanArray(payload.galleryPhotos),
    graveLocation: clean(payload.graveLocation),
    graveAddress: clean(payload.graveAddress),
    graveMapUrl: clean(payload.graveMapUrl),
    graveNotes: clean(payload.graveNotes),
    gravePhoto: clean(payload.gravePhoto),
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
  if (String(person.gravePhoto || "").startsWith("data:image/")) {
    person.gravePhoto = await storePhotoDataUrl(env, person.gravePhoto);
  }
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
    add(person.gravePhoto);
    cleanArray(person.galleryPhotos).forEach(add);
  });
  return ids;
}

async function pruneUnusedPhotos(env, data) {
  const keep = referencedPhotoIds(data);
  const requests = await env.DB.prepare(
    "SELECT payload_json FROM family_change_requests WHERE status = 'pending'",
  ).all();
  (requests.results || []).forEach((row) => {
    try {
      const payload = JSON.parse(row.payload_json || "{}");
      const person = payload.person || payload.changes || {};
      const add = (url) => {
        const match = String(url || "").match(/^\/api\/photos\/([^/?#]+)/);
        if (match) keep.add(match[1]);
      };
      add(person.photo);
      add(person.gravePhoto);
      cleanArray(person.galleryPhotos).forEach(add);
    } catch (error) {
      // A malformed pending request is ignored and will be rejected during review.
    }
  });
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
    [person.photo, person.gravePhoto, ...cleanArray(person.galleryPhotos)].forEach((url) => {
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
  const session = await adminSession(request, env);
  return !!session && (session.isRoot || session.role === "admin");
}

function canEditAll(session) {
  return !!session && (session.isRoot || session.role === "admin" || session.role === "clan_head");
}

function canManageAccounts(session) {
  return !!session && (session.isRoot || session.role === "admin");
}

async function adminSession(request, env) {
  const username = normalizeUsername(await readSignedCookie(request, env, ADMIN_COOKIE, "admin"));
  if (!username) return null;
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (username === rootUsername) {
    return {
      username: rootUsername,
      displayName: "Admin gốc",
      role: "admin",
      personId: await getSetting(env, "root_person_id"),
      isRoot: true,
    };
  }
  const user = await getUser(env, username);
  if (!user || !["admin", "clan_head", "member"].includes(user.role)) return null;
  return {
    username: user.username,
    displayName: user.display_name,
    role: normalizeAccountRole(user.role),
    personId: clean(user.person_id),
    isRoot: false,
  };
}

async function viewerUser(request, env) {
  const admin = await adminSession(request, env);
  if (admin) return { username: admin.username, display_name: admin.displayName, role: admin.role, person_id: admin.personId, isRoot: admin.isRoot };
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
  let role = "admin";
  let personId = "";
  if (username === adminUser) {
    if (!adminPassword || password !== adminPassword) {
      return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
    }
  } else {
    const user = await getUser(env, username);
    if (!user || !["admin", "clan_head", "member"].includes(user.role)) return json({ error: "Tài khoản này không có quyền vào khu cập nhật." }, 403);
    const expected = await passwordHash(password, fromBase64Url(user.salt), user.iterations || PASSWORD_ITERATIONS);
    if (expected !== user.password_hash) return json({ error: "Sai tài khoản hoặc mật khẩu." }, 401);
    displayName = user.display_name;
    role = normalizeAccountRole(user.role);
    personId = clean(user.person_id);
  }
  if (username === adminUser) personId = await getSetting(env, "root_person_id");
  const token = await signPayload(env, {
    scope: "admin",
    user: username,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });
  return json({ ok: true, user: { username, displayName, role, personId, isRoot: username === adminUser } }, 200, { "Set-Cookie": makeCookie(ADMIN_COOKIE, token, 604800) });
}

async function createUserAccount(env, payload) {
  const username = normalizeUsername(payload.username);
  const password = clean(payload.password);
  const displayName = clean(payload.displayName).slice(0, 80) || username;
  const role = normalizeAccountRole(payload.role);
  const personId = clean(payload.personId);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (username.length < 3) return { error: "Tài khoản cần từ 3 ký tự trở lên.", status: 400 };
  if (password.length < 6) return { error: "Mật khẩu cần từ 6 ký tự trở lên.", status: 400 };
  if (username === rootUsername) return { error: "Không thể tạo trùng tài khoản admin gốc.", status: 409 };
  if (await getUser(env, username)) return { error: "Tài khoản này đã tồn tại.", status: 409 };
  if (["member", "clan_head"].includes(role) && !personId) {
    return { error: "Tài khoản Thành viên hoặc Trưởng họ phải được gắn với một người trong gia phả.", status: 400 };
  }
  if (personId) {
    const family = await readFamily(env);
    if (!family.people.some((person) => person.id === personId)) return { error: "Không tìm thấy danh tính đã chọn trong gia phả.", status: 400 };
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, role, person_id, password_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    randomId("u"),
    username,
    displayName,
    role,
    personId || null,
    hash,
    base64Url(salt),
    PASSWORD_ITERATIONS,
    new Date().toISOString(),
  ).run();

  return { user: { username, displayName, role, personId }, status: 201 };
}

async function handleRegister() {
  return json({ error: "Tài khoản xem gia phả do admin tạo." }, 403);
}

async function handleAdminUsersList(request, env) {
  const admin = await adminSession(request, env);
  if (!canManageAccounts(admin)) return json({ error: "Chỉ Admin được quản lý tài khoản." }, admin ? 403 : 401);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  const result = await env.DB.prepare(
    "SELECT username, display_name, COALESCE(role, 'viewer') AS role, COALESCE(person_id, '') AS person_id, created_at FROM users ORDER BY created_at DESC",
  ).all();
  return json({
    currentUser: publicSessionUser(admin),
    users: [
      {
        username: rootUsername,
        displayName: "Admin gốc",
        role: "admin",
        locked: true,
        isRoot: true,
        personId: await getSetting(env, "root_person_id"),
        createdAt: "",
      },
      ...(result.results || []).map((user) => ({
        username: user.username,
        displayName: user.display_name,
        role: user.role || "viewer",
        personId: clean(user.person_id),
        locked: false,
        isRoot: false,
        createdAt: user.created_at,
      })),
    ],
  });
}

async function handleAdminUsersCreate(request, env) {
  const admin = await adminSession(request, env);
  if (!canManageAccounts(admin)) return json({ error: "Chỉ Admin được tạo tài khoản." }, admin ? 403 : 401);
  const result = await createUserAccount(env, await bodyJson(request));
  if (result.error) return json({ error: result.error }, result.status);
  return json({ ok: true, user: result.user }, result.status);
}

async function handleAdminUsersUpdate(request, env, username) {
  const admin = await adminSession(request, env);
  if (!canManageAccounts(admin)) return json({ error: "Chỉ Admin được sửa tài khoản." }, admin ? 403 : 401);
  const cleanUsername = normalizeUsername(username);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (!cleanUsername) return json({ error: "Thiếu tài khoản cần sửa." }, 400);
  const payload = await bodyJson(request);
  const personId = clean(payload.personId);
  if (personId) {
    const family = await readFamily(env);
    if (!family.people.some((person) => person.id === personId)) return json({ error: "Không tìm thấy danh tính đã chọn." }, 400);
  }
  if (cleanUsername === rootUsername) {
    if (!admin.isRoot) return json({ error: "Chỉ Admin gốc được gắn danh tính cho chính mình." }, 403);
    await setSetting(env, "root_person_id", personId);
    return json({ ok: true, user: { username: rootUsername, displayName: "Admin gốc", role: "admin", personId, isRoot: true } });
  }

  const user = await getUser(env, cleanUsername);
  if (!user) return json({ error: "Không tìm thấy tài khoản." }, 404);
  const displayName = clean(payload.displayName).slice(0, 80) || cleanUsername;
  const role = normalizeAccountRole(payload.role);
  if (["member", "clan_head"].includes(role) && !personId) return json({ error: "Vai trò này phải được gắn với một người trong gia phả." }, 400);
  if (admin.username === cleanUsername && user.role === "admin" && role !== "admin") {
    return json({ error: "Không thể tự hạ quyền tài khoản đang đăng nhập." }, 400);
  }

  const password = clean(payload.password);
  if (password) {
    if (password.length < 6) return json({ error: "Mật khẩu cần từ 6 ký tự trở lên." }, 400);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, role = ?, person_id = ?, password_hash = ?, salt = ?, iterations = ? WHERE username = ?",
    ).bind(displayName, role, personId || null, hash, base64Url(salt), PASSWORD_ITERATIONS, cleanUsername).run();
  } else {
    await env.DB.prepare(
      "UPDATE users SET display_name = ?, role = ?, person_id = ? WHERE username = ?",
    ).bind(displayName, role, personId || null, cleanUsername).run();
  }

  return json({ ok: true, user: { username: cleanUsername, displayName, role, personId } });
}

async function handleAdminUsersDelete(request, env, username) {
  const admin = await adminSession(request, env);
  if (!canManageAccounts(admin)) return json({ error: "Chỉ Admin được xóa tài khoản." }, admin ? 403 : 401);
  const cleanUsername = normalizeUsername(username);
  const rootUsername = normalizeUsername(env.FAMILY_ADMIN_USER || "admin");
  if (!cleanUsername) return json({ error: "Thiếu tài khoản cần xóa." }, 400);
  if (cleanUsername === rootUsername) return json({ error: "Không thể xóa tài khoản admin gốc." }, 403);
  if (cleanUsername === admin.username) return json({ error: "Không thể xóa tài khoản đang đăng nhập." }, 400);
  await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(cleanUsername).run();
  return json({ ok: true });
}

async function handleAdminStorage(request, env) {
  const session = await adminSession(request, env);
  if (!canEditAll(session)) return json({ error: "Bạn không có quyền xem dung lượng quản trị." }, session ? 403 : 401);
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
  const session = await adminSession(request, env);
  if (!canEditAll(session)) return json({ error: "Bạn không có quyền kiểm tra dữ liệu." }, session ? 403 : 401);
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
    user: publicSessionUser(user),
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
  const session = await adminSession(request, env);
  return json({ authenticated: !!session, user: publicSessionUser(session) });
}

async function handleViewerSession(request, env) {
  const user = await viewerUser(request, env);
  return json({
    authenticated: !!user,
    user: publicSessionUser(user),
    registrationEnabled: false,
  });
}

const MEMBER_PROFILE_FIELDS = [
  "fullName", "gender", "birthDate", "deathDate", "marriageYear", "familyRole",
  "hometown", "currentResidence", "daughterInLawFather", "daughterInLawMother",
  "daughterHusbandName", "daughterMarriedAddress", "daughterChildrenCount", "address",
  "job", "educationLevel", "academicDegree", "academicRank", "academicTitle", "achievements",
  "photo", "galleryPhotos", "graveLocation", "graveAddress", "graveMapUrl", "graveNotes",
  "gravePhoto", "notes",
];

function memberEditableIds(data, personId) {
  const ids = new Set();
  const identity = data.people.find((person) => person.id === personId);
  if (!identity) return ids;
  ids.add(identity.id);
  const spouseIds = cleanArray(identity.spouseIds);
  spouseIds.forEach((id) => ids.add(id));
  data.people.forEach((person) => {
    if (person.fatherId === identity.id || person.motherId === identity.id
      || spouseIds.includes(person.fatherId) || spouseIds.includes(person.motherId)) ids.add(person.id);
  });
  return ids;
}

function memberChanges(existing, updated) {
  const changes = {};
  MEMBER_PROFILE_FIELDS.forEach((field) => {
    if (JSON.stringify(existing[field] ?? "") !== JSON.stringify(updated[field] ?? "")) changes[field] = updated[field];
  });
  return changes;
}

async function saveChangeRequest(env, session, action, personId, payload) {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT id FROM family_change_requests WHERE username = ? AND person_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
  ).bind(session.username, personId).first();
  const payloadJson = JSON.stringify(payload);
  if (existing?.id) {
    await env.DB.prepare(
      "UPDATE family_change_requests SET action = ?, payload_json = ?, created_at = ?, reviewed_at = NULL, reviewed_by = NULL, review_note = NULL WHERE id = ?",
    ).bind(action, payloadJson, now, existing.id).run();
    return { id: existing.id, status: "pending", replaced: true };
  }
  const id = randomId("change");
  await env.DB.prepare(
    "INSERT INTO family_change_requests (id, username, person_id, action, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
  ).bind(id, session.username, personId, action, payloadJson, now).run();
  return { id, status: "pending", replaced: false };
}

function changeRequestJson(row, data) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json || "{}"); } catch (error) { payload = {}; }
  const current = data.people.find((person) => person.id === row.person_id);
  const proposed = row.action === "create" ? payload.person : { ...current, ...(payload.changes || {}) };
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    personId: row.person_id,
    personName: proposed?.fullName || current?.fullName || "Người mới",
    action: row.action,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    changes: payload.changes || null,
    person: row.action === "create" ? payload.person || null : null,
  };
}

async function handleChangeRequestsList(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: "Bạn cần đăng nhập khu cập nhật." }, 401);
  const data = await readFamily(env);
  const sql = canManageAccounts(session)
    ? "SELECT r.*, u.display_name FROM family_change_requests r LEFT JOIN users u ON u.username = r.username ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 300"
    : "SELECT r.*, u.display_name FROM family_change_requests r LEFT JOIN users u ON u.username = r.username WHERE r.username = ? ORDER BY r.created_at DESC LIMIT 100";
  const statement = env.DB.prepare(sql);
  const result = canManageAccounts(session) ? await statement.all() : await statement.bind(session.username).all();
  return json({ requests: (result.results || []).map((row) => changeRequestJson(row, data)) });
}

async function handleChangeRequestReview(request, env, id, decision) {
  const session = await adminSession(request, env);
  if (!canManageAccounts(session)) return json({ error: "Chỉ Admin được duyệt yêu cầu." }, session ? 403 : 401);
  const row = await env.DB.prepare("SELECT * FROM family_change_requests WHERE id = ?").bind(clean(id)).first();
  if (!row) return json({ error: "Không tìm thấy yêu cầu." }, 404);
  if (row.status !== "pending") return json({ error: "Yêu cầu này đã được xử lý trước đó." }, 409);
  const body = await bodyJson(request);
  const note = clean(body.reviewNote).slice(0, 500);
  const now = new Date().toISOString();
  if (decision === "rejected") {
    await env.DB.prepare(
      "UPDATE family_change_requests SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, review_note = ? WHERE id = ? AND status = 'pending'",
    ).bind(now, session.username, note, row.id).run();
    return json({ ok: true, status: "rejected" });
  }

  let payload;
  try { payload = JSON.parse(row.payload_json || "{}"); } catch (error) { return json({ error: "Nội dung yêu cầu bị hỏng, hãy từ chối và yêu cầu gửi lại." }, 400); }
  const data = await readFamily(env);
  if (row.action === "create") {
    if (data.people.some((person) => person.id === row.person_id)) return json({ error: "Người này đã được thêm trước đó." }, 409);
    const person = await ensureExternalPersonPhotos(env, normalizePerson(payload.person || {}, row.person_id));
    if (!person.fullName) return json({ error: "Yêu cầu thiếu họ tên." }, 400);
    data.people.push(person);
  } else {
    const index = data.people.findIndex((person) => person.id === row.person_id);
    if (index < 0) return json({ error: "Thành viên cần sửa không còn trong gia phả." }, 404);
    const merged = { ...data.people[index], ...(payload.changes || {}) };
    data.people[index] = await ensureExternalPersonPhotos(env, normalizePerson(merged, row.person_id));
  }
  await writeFamily(env, data);
  await env.DB.prepare(
    "UPDATE family_change_requests SET status = 'approved', reviewed_at = ?, reviewed_by = ?, review_note = ? WHERE id = ? AND status = 'pending'",
  ).bind(now, session.username, note, row.id).run();
  return json({ ok: true, status: "approved", personId: row.person_id });
}

async function handlePeopleGet(request, env) {
  const user = await viewerUser(request, env);
  if (!user) return json({ error: "Bạn cần đăng nhập để xem gia phả." }, 401);
  return json(await readFamily(env));
}

async function handlePeopleCreate(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: "Bạn cần đăng nhập khu cập nhật." }, 401);
  const person = await ensureExternalPersonPhotos(env, normalizePerson(await bodyJson(request)));
  if (!person.fullName) return json({ error: "Vui lòng nhập họ tên." }, 400);
  const data = await readFamily(env);
  if (!canEditAll(session)) {
    if (session.role !== "member" || !session.personId) return json({ error: "Tài khoản chưa được gắn danh tính nên chưa thể gửi thông tin." }, 403);
    const identity = data.people.find((item) => item.id === session.personId);
    const allowedParents = new Set([identity?.id, ...cleanArray(identity?.spouseIds)].filter(Boolean));
    const selectedParents = [person.fatherId, person.motherId].filter(Boolean);
    if (!selectedParents.length || selectedParents.some((parentId) => !allowedParents.has(parentId))) {
      return json({ error: "Thành viên chỉ được đề nghị thêm con của mình hoặc của vợ/chồng mình." }, 403);
    }
    person.spouseIds = [];
    const requestResult = await saveChangeRequest(env, session, "create", person.id, { person });
    return json({ id: person.id, pendingApproval: true, requestId: requestResult.id }, 202);
  }
  data.people.push(person);
  await writeFamily(env, data);
  return json(person, 201);
}

async function handlePeopleUpdate(request, env, id) {
  const session = await adminSession(request, env);
  if (!session) return json({ error: "Bạn cần đăng nhập khu cập nhật." }, 401);
  const data = await readFamily(env);
  const index = data.people.findIndex((person) => person.id === id);
  if (index < 0) return json({ error: "Không tìm thấy người này." }, 404);
  const updated = await ensureExternalPersonPhotos(env, normalizePerson(await bodyJson(request), id));
  if (!updated.fullName) return json({ error: "Vui lòng nhập họ tên." }, 400);
  if (!canEditAll(session)) {
    if (session.role !== "member" || !session.personId) return json({ error: "Tài khoản chưa được gắn danh tính nên chưa thể sửa thông tin." }, 403);
    if (!memberEditableIds(data, session.personId).has(id)) {
      return json({ error: "Bạn chỉ được đề nghị sửa hồ sơ của mình, vợ/chồng và các con." }, 403);
    }
    const changes = memberChanges(data.people[index], updated);
    if (!Object.keys(changes).length) return json({ error: "Không có thông tin nào thay đổi." }, 400);
    const requestResult = await saveChangeRequest(env, session, "update", id, { changes });
    return json({ id, pendingApproval: true, requestId: requestResult.id }, 202);
  }
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
  const session = await adminSession(request, env);
  if (!canEditAll(session)) return json({ error: "Thành viên không được xóa người khỏi gia phả." }, session ? 403 : 401);
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
  const session = await adminSession(request, env);
  if (!canEditAll(session)) return json({ error: "Bạn không có quyền nhập toàn bộ dữ liệu." }, session ? 403 : 401);
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
  const session = await adminSession(request, env);
  if (!session || (session.role === "member" && !session.personId)) return json({ error: "Tài khoản chưa có quyền tải ảnh." }, session ? 403 : 401);
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

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method) && !mutationOriginAllowed(request)) {
      return json({ error: "Yêu cầu không cùng nguồn với trang gia phả." }, 403);
    }

    if (method === "GET" && path === "viewer-session") return handleViewerSession(request, env);
    if (method === "GET" && path === "me") return handleMe(request, env);
    if (method === "GET" && path === "admin/storage") return handleAdminStorage(request, env);
    if (method === "GET" && path === "admin/diagnostics") return handleAdminDiagnostics(request, env);
    if (method === "GET" && path === "admin/users") return handleAdminUsersList(request, env);
    if (method === "POST" && path === "admin/users") return handleAdminUsersCreate(request, env);
    if (method === "PUT" && parts[0] === "admin" && parts[1] === "users" && parts[2]) return handleAdminUsersUpdate(request, env, decodeURIComponent(parts[2]));
    if (method === "DELETE" && parts[0] === "admin" && parts[1] === "users" && parts[2]) return handleAdminUsersDelete(request, env, decodeURIComponent(parts[2]));
    if (method === "GET" && path === "change-requests") return handleChangeRequestsList(request, env);
    if (method === "POST" && parts[0] === "change-requests" && parts[1] && parts[2] === "approve") return handleChangeRequestReview(request, env, decodeURIComponent(parts[1]), "approved");
    if (method === "POST" && parts[0] === "change-requests" && parts[1] && parts[2] === "reject") return handleChangeRequestReview(request, env, decodeURIComponent(parts[1]), "rejected");
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
