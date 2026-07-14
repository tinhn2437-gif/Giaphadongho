const state = {
  data: { familyName: "Gia phả dòng họ Nguyễn Hữu", people: [] },
  view: "tree",
  query: "",
  selectedId: "",
  photoPersonId: "",
  photoUrl: "",
  photoTitle: "",
  scale: 0.82,
  pan: { x: 60, y: 40 },
  hasAutoFitTree: false,
  isAdmin: location.pathname === "/admin",
  authenticated: false,
  viewerAuthenticated: false,
  viewerUser: null,
  viewerAccounts: [],
  currentAdmin: null,
  storageStats: null,
  changeRequests: [],
  menuOpen: false,
  editingId: "",
  adminQuery: "",
  honorFilter: "all",
  kinshipOpen: false,
  kinshipPersonAId: "",
  kinshipPersonBId: "",
  staticMode: false,
  touch: null,
  personIndex: new Map(),
  layoutCache: null,
  viewerSessionError: "",
};

const emptyPerson = {
  id: "",
  fullName: "",
  gender: "Nam",
  birthDate: "",
  deathDate: "",
  marriageYear: "",
  familyRole: "Khác",
  hometown: "",
  currentResidence: "",
  daughterInLawFather: "",
  daughterInLawMother: "",
  daughterHusbandName: "",
  daughterMarriedAddress: "",
  daughterChildrenCount: "",
  address: "",
  job: "",
  educationLevel: "",
  academicDegree: "",
  academicRank: "",
  academicTitle: "",
  achievements: [],
  fatherId: "",
  motherId: "",
  spouseIds: [],
  photo: "",
  galleryPhotos: [],
  graveLocation: "",
  graveAddress: "",
  graveMapUrl: "",
  graveNotes: "",
  gravePhoto: "",
  notes: "",
};

const EDUCATION_LEVELS = ["Phổ thông", "Cao đẳng", "Đại học"];
const ACADEMIC_DEGREES = ["Cử nhân", "Thạc sĩ", "Tiến sĩ"];
const ACADEMIC_RANKS = ["PGS", "GS"];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const app = $("#app");

async function api(path, options = {}) {
  const { timeoutMs, ...requestOptions } = options;
  const method = String(requestOptions.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let response = null;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || (method === "GET" ? 15000 : 45000));
    try {
      response = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(requestOptions.headers || {}) },
        ...requestOptions,
        signal: controller.signal,
      });
      if (![502, 503, 504].includes(response.status) || attempt === attempts - 1) break;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        if (error?.name === "AbortError") throw new Error("Máy chủ phản hồi quá lâu. Hãy thử lại sau ít phút.");
        throw new Error("Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.");
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (!response) throw lastError || new Error("Không kết nối được máy chủ.");
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) throw new Error("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn hoặc để web tự nén lại rồi thử lần nữa.");
    if (response.status === 401) throw new Error(data.error || "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    throw new Error(data.error || "Có lỗi xảy ra.");
  }
  return data;
}

function allowsStaticFallback() {
  return location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
}

function rebuildPersonIndex() {
  state.personIndex = new Map((state.data.people || []).map((person) => [person.id, person]));
  state.layoutCache = null;
}

async function loadData() {
  try {
    state.data = await api("/api/people");
    state.staticMode = false;
  } catch (error) {
    if (!allowsStaticFallback()) throw error;
    const response = await fetch("family.json", { cache: "no-store" });
    if (!response.ok) throw error;
    state.data = await response.json();
    state.staticMode = true;
    state.isAdmin = false;
  }
  rebuildPersonIndex();
  if (!state.editingId && state.data.people[0]) state.editingId = state.data.people[0].id;
}

function staticViewerUser() {
  try {
    return JSON.parse(localStorage.getItem("family_viewer_user") || "null");
  } catch (error) {
    return null;
  }
}

async function loadViewerSession() {
  try {
    const session = await api("/api/viewer-session");
    state.staticMode = false;
    state.viewerAuthenticated = !!session.authenticated;
    state.viewerUser = session.user || null;
    state.viewerSessionError = "";
  } catch (error) {
    if (allowsStaticFallback()) {
      state.staticMode = true;
      state.viewerUser = staticViewerUser();
      state.viewerAuthenticated = !!state.viewerUser;
    } else {
      state.staticMode = false;
      state.viewerUser = null;
      state.viewerAuthenticated = false;
      state.viewerSessionError = error.message;
    }
  }
}

async function loadViewerAccounts() {
  try {
    const result = await api("/api/admin/users");
    state.viewerAccounts = result.users || [];
    state.currentAdmin = result.currentUser || null;
  } catch (error) {
    state.viewerAccounts = [];
  }
}

async function loadChangeRequests() {
  try {
    const result = await api("/api/change-requests");
    state.changeRequests = result.requests || [];
  } catch (error) {
    state.changeRequests = [];
  }
}

async function loadStorageStats() {
  try {
    state.storageStats = await api("/api/admin/storage");
  } catch (error) {
    state.storageStats = null;
  }
}

function personById(id) {
  if (!id) return undefined;
  if (state.personIndex.size !== (state.data.people || []).length) rebuildPersonIndex();
  return state.personIndex.get(id);
}

function roleLabel(role, isRoot = false) {
  if (isRoot) return "Admin gốc";
  return ({ admin: "Admin", clan_head: "Trưởng họ", member: "Thành viên", viewer: "Người xem" })[role] || "Người xem";
}

function adminCanManageAccounts() {
  return !!state.currentAdmin && (state.currentAdmin.isRoot || state.currentAdmin.role === "admin");
}

function adminCanEditAll() {
  return !!state.currentAdmin && (adminCanManageAccounts() || state.currentAdmin.role === "clan_head");
}

function editablePersonIdsForCurrentUser() {
  if (adminCanEditAll()) return new Set(state.data.people.map((person) => person.id));
  const identity = personById(state.currentAdmin?.personId);
  if (!identity) return new Set();
  const spouseIds = identity.spouseIds || [];
  const result = new Set([identity.id, ...spouseIds]);
  state.data.people.forEach((person) => {
    if ([identity.id, ...spouseIds].includes(person.fatherId) || [identity.id, ...spouseIds].includes(person.motherId)) result.add(person.id);
  });
  return result;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function isSubsequence(needle, value) {
  let index = 0;
  for (const char of value) {
    if (char === needle[index]) index += 1;
    if (index >= needle.length) return true;
  }
  return !needle;
}

function smallEditDistance(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function partialDateParts(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (match) {
    return {
      year: Number.parseInt(match[1], 10),
      month: match[2] ? Number.parseInt(match[2], 10) : null,
      day: match[3] ? Number.parseInt(match[3], 10) : null,
      raw: text,
    };
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return {
      year: Number.parseInt(match[3], 10),
      month: Number.parseInt(match[2], 10),
      day: Number.parseInt(match[1], 10),
      raw: text,
    };
  }
  match = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (match) {
    return {
      year: Number.parseInt(match[2], 10),
      month: Number.parseInt(match[1], 10),
      day: null,
      raw: text,
    };
  }
  match = text.match(/^(\d{4})$/);
  if (match) return { year: Number.parseInt(match[1], 10), month: null, day: null, raw: text };
  return null;
}

function formatDate(value) {
  const parts = partialDateParts(value);
  if (!parts || !Number.isFinite(parts.year)) return String(value || "").trim();
  if (parts.day && parts.month) return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
  if (parts.month) return `${String(parts.month).padStart(2, "0")}/${parts.year}`;
  return String(parts.year);
}

function icon(name) {
  const icons = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4.2-4.2"></path>',
    tree: '<path d="M12 4v5"></path><path d="M6 14v-2a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2"></path><rect x="8" y="3" width="8" height="5" rx="1"></rect><rect x="3" y="15" width="6" height="5" rx="1"></rect><rect x="15" y="15" width="6" height="5" rx="1"></rect>',
    list: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
    minus: '<path d="M5 12h14"></path>',
    fit: '<path d="M8 3H4v4"></path><path d="M16 3h4v4"></path><path d="M20 17v4h-4"></path><path d="M4 17v4h4"></path><path d="M4 7l5 5"></path><path d="M20 7l-5 5"></path><path d="M20 17l-5-5"></path><path d="M4 17l5-5"></path>',
    plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    left: '<path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path>',
    right: '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
    up: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
    down: '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>',
    male: '<circle cx="10" cy="14" r="5"></circle><path d="M14 10l6-6"></path><path d="M15 4h5v5"></path>',
    female: '<circle cx="12" cy="9" r="5"></circle><path d="M12 14v7"></path><path d="M9 18h6"></path>',
    genderOther: '<circle cx="12" cy="12" r="5"></circle><path d="M12 17v4"></path><path d="M9 21h6"></path><path d="M16 8l4-4"></path>',
    alive: '<path d="M20 6 9 17l-5-5"></path><circle cx="12" cy="12" r="10"></circle>',
    deceased: '<circle cx="12" cy="12" r="10"></circle><path d="M8 8l8 8"></path><path d="M16 8l-8 8"></path>',
    order: '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
    menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
    users: '<circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><path d="M3 19v-1a5 5 0 0 1 5-5"></path><path d="M21 19v-1a5 5 0 0 0-5-5"></path><path d="M11 14h2"></path>',
    download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    award: '<circle cx="12" cy="8" r="6"></circle><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"></path><path d="m9.5 8 1.6 1.6L14.8 6"></path>',
    mapPin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
}

function initials(name) {
  const words = String(name || "?").trim().split(/\s+/);
  return (words[words.length - 1] || "?").slice(0, 2).toUpperCase();
}

function assetUrl(path) {
  if (state.staticMode && String(path || "").startsWith("/")) return "." + path;
  return path;
}

function photoHtml(person, className = "person-photo") {
  if (person.photo) {
    return `
      <button class="photo-button" data-photo-person-id="${esc(person.id)}" type="button" title="Xem ảnh ${esc(person.fullName)}" aria-label="Xem ảnh ${esc(person.fullName)}">
        <img class="${className}" src="${esc(assetUrl(person.photo))}" alt="${esc(person.fullName)}" loading="lazy" decoding="async">
      </button>
    `;
  }
  return `<div class="avatar-fallback">${esc(initials(person.fullName))}</div>`;
}

function genderClass(person) {
  if (person.gender === "Nữ") return "female";
  if (person.gender === "Nam") return "male";
  return "other";
}

function genderIconName(person) {
  if (person.gender === "Nữ") return "female";
  if (person.gender === "Nam") return "male";
  return "genderOther";
}

function lifeStatus(person) {
  return person.deathDate
    ? { label: "Đã mất", className: "deceased", icon: "deceased" }
    : { label: "Còn sống", className: "alive", icon: "alive" };
}

function personResidence(person) {
  return person.currentResidence || person.address || "";
}

function birthSortValue(person) {
  const parts = partialDateParts(person.birthDate);
  if (!parts || !Number.isFinite(parts.year)) return Number.MAX_SAFE_INTEGER;
  return parts.year * 10000 + (parts.month || 99) * 100 + (parts.day || 99);
}

function compareChildren(a, b) {
  const birthDiff = birthSortValue(a) - birthSortValue(b);
  if (birthDiff !== 0) return birthDiff;
  return a.fullName.localeCompare(b.fullName, "vi");
}

function childrenForParent(parentId) {
  return state.data.people
    .filter((item) => item.fatherId === parentId || item.motherId === parentId)
    .filter((item) => item.familyRole !== "Con dâu")
    .sort(compareChildren);
}

function marriageYearFor(person) {
  if (person.marriageYear) return person.marriageYear;
  const spouse = (person.spouseIds || []).map(personById).find(Boolean);
  return spouse?.marriageYear || "";
}

function siblingKey(person) {
  if (person.fatherId || person.motherId) return `${person.fatherId || "_"}|${person.motherId || "_"}`;
  return "";
}

function childOrderNumber(person) {
  const key = siblingKey(person);
  if (!key) return null;
  const siblings = state.data.people
    .filter((item) => siblingKey(item) === key && item.familyRole !== "Con dâu")
    .sort(compareChildren);
  const index = siblings.findIndex((item) => item.id === person.id);
  return index < 0 ? null : index + 1;
}

function spouseForInLaw(person) {
  const spouses = (person.spouseIds || []).map(personById).filter(Boolean);
  return spouses.find((spouse) => spouse.familyRole === "Con trai")
    || spouses.find((spouse) => spouse.gender === "Nam")
    || spouses.find((spouse) => spouse.familyRole !== "Con dâu")
    || null;
}

function inLawParents(person) {
  const husband = spouseForInLaw(person);
  return {
    husband,
    fatherInLaw: husband ? personById(husband.fatherId) : null,
    motherInLaw: husband ? personById(husband.motherId) : null,
  };
}

function parentSummary(person) {
  if (person.familyRole === "Con dâu") {
    const { fatherInLaw, motherInLaw } = inLawParents(person);
    const birthParents = [
      person.daughterInLawFather ? `Bố đẻ: ${esc(person.daughterInLawFather)}` : "",
      person.daughterInLawMother ? `Mẹ đẻ: ${esc(person.daughterInLawMother)}` : "",
    ].filter(Boolean);
    const spouseParents = [
      fatherInLaw ? `Bố chồng: ${esc(fatherInLaw.fullName)}` : "",
      motherInLaw ? `Mẹ chồng: ${esc(motherInLaw.fullName)}` : "",
    ].filter(Boolean);
    return [...birthParents, ...spouseParents].join("<br>") || "Chưa cập nhật";
  }
  const father = personById(person.fatherId)?.fullName || "";
  const mother = personById(person.motherId)?.fullName || "";
  return `${esc(father || "Chưa có")}<br>${esc(mother || "")}`;
}

function childOrderText(person) {
  if (person.familyRole === "Con dâu") {
    const spouse = spouseForInLaw(person);
    const spouseOrder = spouse ? childOrderNumber(spouse) : null;
    return spouseOrder ? `Dâu ${spouseOrder}` : "";
  }
  const order = childOrderNumber(person);
  return order ? `Con thứ ${order}` : "";
}

function badgeHtml({ icon: iconName, label, className = "" }) {
  return `<span class="mini-badge ${className}">${icon(iconName)}<span>${esc(label)}</span></span>`;
}

function genderIconHtml(person) {
  return `<span class="gender-symbol ${genderClass(person)}">${icon(genderIconName(person))}</span>`;
}

function getStats() {
  const people = state.data.people;
  const childCount = people.filter((person) => person.fatherId || person.motherId).length;
  const marriedCount = people.filter((person) => (person.spouseIds || []).length).length;
  const achievementCount = people.filter((person) => (person.achievements || []).length).length;
  return { people: people.length, childCount, marriedCount, achievementCount };
}

function buildLayout() {
  const people = state.data.people;
  if (state.layoutCache?.people === people) return state.layoutCache.value;
  const byId = new Map(people.map((person) => [person.id, person]));
  const children = new Map();
  people.forEach((person) => {
    [person.fatherId, person.motherId].forEach((parentId) => {
      if (!parentId || !byId.has(parentId)) return;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(person.id);
    });
  });

  const generation = new Map();
  people.forEach((person) => {
    const hasParent = byId.has(person.fatherId) || byId.has(person.motherId);
    if (!hasParent) generation.set(person.id, 0);
  });

  for (let pass = 0; pass < people.length + 5; pass++) {
    let changed = false;
    people.forEach((person) => {
      const parentGenerations = [person.fatherId, person.motherId]
        .map((id) => generation.get(id))
        .filter((item) => Number.isFinite(item));
      if (parentGenerations.length) {
        const nextGeneration = Math.max(...parentGenerations) + 1;
        if (generation.get(person.id) !== nextGeneration) {
          generation.set(person.id, nextGeneration);
          changed = true;
        }
      }
      (person.spouseIds || []).forEach((spouseId) => {
        const currentGen = generation.get(person.id);
        const spouseGen = generation.get(spouseId);
        if (Number.isFinite(currentGen) && Number.isFinite(spouseGen)) {
          const sameRowGen = Math.max(currentGen, spouseGen);
          if (currentGen !== sameRowGen) {
            generation.set(person.id, sameRowGen);
            changed = true;
          }
          if (spouseGen !== sameRowGen) {
            generation.set(spouseId, sameRowGen);
            changed = true;
          }
        } else if (Number.isFinite(currentGen)) {
          generation.set(spouseId, currentGen);
          changed = true;
        } else if (Number.isFinite(spouseGen)) {
          generation.set(person.id, spouseGen);
          changed = true;
        }
      });
    });
    if (!changed) break;
  }
  people.forEach((person) => {
    if (!generation.has(person.id)) generation.set(person.id, 0);
  });

  const generations = new Map();
  people.forEach((person) => {
    const gen = generation.get(person.id) || 0;
    if (!generations.has(gen)) generations.set(gen, []);
    generations.get(gen).push(person);
  });

  const CARD_W = people.length > 500 ? 178 : people.length > 220 ? 194 : 218;
  const CARD_H = people.length > 500 ? 116 : people.length > 220 ? 120 : 128;
  const PHOTO_W = people.length > 500 ? 48 : people.length > 220 ? 52 : 58;
  const PHOTO_H = people.length > 500 ? 60 : people.length > 220 ? 66 : 72;
  const SPOUSE_GAP = people.length > 500 ? 10 : people.length > 220 ? 12 : 16;
  const GROUP_GAP = people.length > 500 ? 50 : people.length > 220 ? 56 : 62;
  const BASE_ROW_GAP = people.length > 500 ? 170 : people.length > 220 ? 180 : 188;
  const PADDING = 80;
  const positions = new Map();
  const groupsByGen = new Map();
  let maxX = 0;
  let maxY = 0;

  const groupWidth = (group) => group.length * CARD_W + (group.length - 1) * SPOUSE_GAP;
  const parentKeyOf = (person) => person && (person.fatherId || person.motherId) ? `${person.fatherId || "_"}|${person.motherId || "_"}` : "";
  const parentGenerationOf = (person) => {
    const parentGenerations = [person?.fatherId, person?.motherId]
      .map((id) => generation.get(id))
      .filter((item) => Number.isFinite(item));
    return parentGenerations.length ? Math.max(...parentGenerations) : null;
  };
  const relationPressure = new Map();
  people.forEach((person) => {
    const parentGen = parentGenerationOf(person);
    const childGen = generation.get(person.id);
    const key = parentKeyOf(person);
    if (parentGen === null || !key || !Number.isFinite(childGen) || childGen <= parentGen) return;
    if (!relationPressure.has(parentGen)) relationPressure.set(parentGen, new Map());
    const relations = relationPressure.get(parentGen);
    if (!relations.has(key)) relations.set(key, 0);
    relations.set(key, relations.get(key) + 1);
  });
  const rowGapAfter = new Map();
  relationPressure.forEach((relations, gen) => {
    const relationCount = relations.size;
    const maxChildren = Math.max(...Array.from(relations.values()), 1);
    const childTotal = Array.from(relations.values()).reduce((sum, count) => sum + count, 0);
    const extraForRelations = Math.max(0, relationCount - 1) * 30;
    const extraForChildren = Math.max(0, maxChildren - 2) * 12;
    const extraForCrowding = Math.max(0, childTotal - 6) * 5;
    const roomForSeparateEdgeTracks = 92 + childTotal * 16;
    rowGapAfter.set(gen, Math.max(
      BASE_ROW_GAP + Math.min(420, extraForRelations + extraForChildren + extraForCrowding),
      roomForSeparateEdgeTracks,
    ));
  });
  const yForGeneration = new Map();
  Array.from(generations.keys())
    .sort((a, b) => a - b)
    .forEach((gen, index, orderedGens) => {
      if (index === 0) {
        yForGeneration.set(gen, PADDING);
        return;
      }
      const previousGen = orderedGens[index - 1];
      const previousY = yForGeneration.get(previousGen);
      const missingSteps = Math.max(1, gen - previousGen);
      let y = previousY + CARD_H;
      for (let step = 0; step < missingSteps; step++) {
        y += rowGapAfter.get(previousGen + step) || BASE_ROW_GAP;
      }
      yForGeneration.set(gen, y);
    });
  const groupAnchor = (group) => {
    const members = group.map((id) => byId.get(id)).filter(Boolean);
    return members.find((person) => person.familyRole !== "Con dâu" && parentKeyOf(person))
      || members.find((person) => parentKeyOf(person))
      || members[0];
  };
  const parentCenterForKey = (key) => {
    if (!key) return null;
    const [fatherId, motherId] = key.split("|").map((id) => id === "_" ? "" : id);
    const parentPositions = [fatherId, motherId].map((id) => positions.get(id)).filter(Boolean);
    if (!parentPositions.length) return null;
    return parentPositions.reduce((sum, item) => sum + item.x + item.w / 2, 0) / parentPositions.length;
  };
  const groupBirthOrder = (group) => birthSortValue(groupAnchor(group));
  const marriageSortValue = (person) => {
    const match = String(person?.marriageYear || "").match(/\d{4}/);
    return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
  };
  const compareSpouses = (a, b) => {
    const marriageDiff = marriageSortValue(a) - marriageSortValue(b);
    if (marriageDiff !== 0) return marriageDiff;
    const birthDiff = birthSortValue(a) - birthSortValue(b);
    if (birthDiff !== 0) return birthDiff;
    return (a?.fullName || "").localeCompare(b?.fullName || "", "vi");
  };
  const defaultGroupOrder = (group) => group.slice().sort((a, b) => {
    const personA = byId.get(a);
    const personB = byId.get(b);
    if (personA?.familyRole === "Con dâu" && personB?.familyRole !== "Con dâu") return -1;
    if (personA?.familyRole !== "Con dâu" && personB?.familyRole === "Con dâu") return 1;
    return (personA?.fullName || "").localeCompare(personB?.fullName || "", "vi");
  });
  const spouseGroupOrder = (group) => {
    const members = group.map((id) => byId.get(id)).filter(Boolean);
    const memberIds = new Set(group);
    const hubs = members
      .map((person) => ({
        person,
        spouseCount: (person.spouseIds || []).filter((id) => memberIds.has(id)).length,
      }))
      .filter((item) => item.spouseCount >= 2)
      .sort((a, b) => {
        const maleDiff = (b.person.gender === "Nam" ? 1 : 0) - (a.person.gender === "Nam" ? 1 : 0);
        if (maleDiff !== 0) return maleDiff;
        const inLawDiff = (a.person.familyRole === "Con dâu" ? 1 : 0) - (b.person.familyRole === "Con dâu" ? 1 : 0);
        if (inLawDiff !== 0) return inLawDiff;
        return b.spouseCount - a.spouseCount;
      });
    const hub = hubs[0]?.person;
    if (!hub) return defaultGroupOrder(group);

    const spouses = (hub.spouseIds || [])
      .map((id) => byId.get(id))
      .filter((person) => person && memberIds.has(person.id))
      .sort(compareSpouses);
    if (spouses.length < 2) return defaultGroupOrder(group);

    const spouseIds = new Set(spouses.map((person) => person.id));
    const others = defaultGroupOrder(group.filter((id) => id !== hub.id && !spouseIds.has(id)));
    const leftCount = Math.ceil(spouses.length / 2);
    return [
      ...spouses.slice(0, leftCount).map((person) => person.id),
      hub.id,
      ...spouses.slice(leftCount).map((person) => person.id),
      ...others,
    ];
  };
  const packRowItems = (items) => {
    const targeted = items
      .filter((item) => item.target !== null)
      .map((item) => ({ ...item, idealX: item.x }))
      .sort((a, b) => a.idealX - b.idealX);
    const loose = items.filter((item) => item.target === null);
    const componentBounds = (component) => ({
      min: Math.min(...component.map((item) => item.idealX)),
      max: Math.max(...component.map((item) => item.idealX + item.width)),
    });
    const placeComponent = (component) => {
      component.sort((a, b) => a.idealX - b.idealX);
      const ideal = componentBounds(component);
      const totalWidth = component.reduce((sum, item) => sum + item.width, 0) + GROUP_GAP * Math.max(0, component.length - 1);
      let x = (ideal.min + ideal.max) / 2 - totalWidth / 2;
      component.forEach((item) => {
        item.x = x;
        x += item.width + GROUP_GAP;
      });
      return {
        min: component[0].x,
        max: component[component.length - 1].x + component[component.length - 1].width,
      };
    };
    let components = [];
    targeted.forEach((item) => {
      const last = components[components.length - 1];
      if (!last) {
        components.push([item]);
        return;
      }
      const lastBounds = componentBounds(last);
      if (item.idealX <= lastBounds.max + GROUP_GAP) last.push(item);
      else components.push([item]);
    });

    let merged = true;
    while (merged) {
      merged = false;
      const next = [];
      components.forEach((component) => {
        const bounds = placeComponent(component);
        const previous = next[next.length - 1];
        if (!previous) {
          next.push(component);
          return;
        }
        const previousBounds = placeComponent(previous);
        if (bounds.min < previousBounds.max + GROUP_GAP) {
          previous.push(...component);
          merged = true;
        } else {
          next.push(component);
        }
      });
      components = next;
    }
    components.forEach(placeComponent);

    const packedTargeted = components.flat().sort((a, b) => a.x - b.x);
    const rowStart = Math.min(...packedTargeted.map((item) => item.x), PADDING);
    if (rowStart < PADDING) {
      const delta = PADDING - rowStart;
      packedTargeted.forEach((item) => { item.x += delta; });
    }
    let cursor = packedTargeted.length
      ? Math.max(...packedTargeted.map((item) => item.x + item.width)) + GROUP_GAP
      : PADDING;
    loose
      .sort((a, b) => (groupAnchor(a.groups[0])?.fullName || "").localeCompare(groupAnchor(b.groups[0])?.fullName || "", "vi"))
      .forEach((item) => {
        item.x = cursor;
        cursor += item.width + GROUP_GAP;
      });
    return [...packedTargeted, ...loose].sort((a, b) => a.x - b.x);
  };

  Array.from(generations.keys())
    .sort((a, b) => a - b)
    .forEach((gen) => {
      const row = generations.get(gen).slice();
      const seen = new Set();
      const groups = [];
      row
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"))
        .forEach((person) => {
          if (seen.has(person.id)) return;
          const groupIds = [];
          const queue = [person.id];
          seen.add(person.id);
          while (queue.length) {
            const id = queue.shift();
            groupIds.push(id);
            const current = byId.get(id);
            (current?.spouseIds || []).forEach((spouseId) => {
              if (!seen.has(spouseId) && generation.get(spouseId) === gen) {
                seen.add(spouseId);
                queue.push(spouseId);
              }
            });
          }
          groups.push(spouseGroupOrder(groupIds));
        });

      const y = yForGeneration.get(gen) ?? PADDING;
      const parentBands = new Map();
      const looseGroups = [];
      groups.forEach((group) => {
        const anchor = groupAnchor(group);
        const key = parentKeyOf(anchor);
        const target = parentCenterForKey(key);
        if (target === null) {
          looseGroups.push(group);
          return;
        }
        if (!parentBands.has(key)) parentBands.set(key, { target, groups: [] });
        parentBands.get(key).groups.push(group);
      });

      const rowItems = [];
      parentBands.forEach((band) => {
        band.groups.sort((a, b) => {
          const birthDiff = groupBirthOrder(a) - groupBirthOrder(b);
          if (birthDiff !== 0) return birthDiff;
          return (groupAnchor(a)?.fullName || "").localeCompare(groupAnchor(b)?.fullName || "", "vi");
        });
        const totalWidth = band.groups.reduce((sum, group) => sum + groupWidth(group), 0) + GROUP_GAP * Math.max(0, band.groups.length - 1);
        rowItems.push({ groups: band.groups, x: band.target - totalWidth / 2, width: totalWidth, target: band.target });
      });
      looseGroups
        .sort((a, b) => (groupAnchor(a)?.fullName || "").localeCompare(groupAnchor(b)?.fullName || "", "vi"))
        .forEach((group) => {
          rowItems.push({ groups: [group], x: 0, width: groupWidth(group), target: null });
        });

      rowItems.sort((a, b) => {
        const targetA = a.target ?? Number.MAX_SAFE_INTEGER;
        const targetB = b.target ?? Number.MAX_SAFE_INTEGER;
        if (targetA !== targetB) return targetA - targetB;
        return a.x - b.x;
      });

      packRowItems(rowItems).forEach((item) => {
        let groupX = item.x;
        item.groups.forEach((group) => {
          group.forEach((id, index) => {
            positions.set(id, { x: groupX + index * (CARD_W + SPOUSE_GAP), y, w: CARD_W, h: CARD_H, gen });
          });
          groupX += groupWidth(group) + GROUP_GAP;
        });
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, y + CARD_H);
      });
      groupsByGen.set(gen, groups);
    });

  const allPositions = Array.from(positions.values());
  const minX = allPositions.length ? Math.min(...allPositions.map((item) => item.x)) : 0;
  const shiftX = minX < PADDING ? PADDING - minX : PADDING;
  positions.forEach((position) => {
    position.x += shiftX;
  });
  maxX += shiftX;
  const groupBounds = (group) => {
    const groupPositions = group.map((id) => positions.get(id)).filter(Boolean);
    if (!groupPositions.length) return null;
    return {
      minX: Math.min(...groupPositions.map((position) => position.x)),
      maxX: Math.max(...groupPositions.map((position) => position.x + position.w)),
    };
  };
  const shiftGroup = (group, deltaX) => {
    group.forEach((id) => {
      const position = positions.get(id);
      if (position) position.x += deltaX;
    });
  };
  const firstGen = Math.min(...Array.from(groupsByGen.keys()));
  const topPositions = (groupsByGen.get(firstGen) || [])
    .flat()
    .map((id) => positions.get(id))
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  let axisX = topPositions.length
    ? topPositions[Math.floor(topPositions.length / 2)].x + CARD_W / 2
    : PADDING + CARD_W / 2;
  const ROW_CENTER_GAP = Math.max(28, Math.round(GROUP_GAP * 0.72));
  Array.from(groupsByGen.keys())
    .sort((a, b) => a - b)
    .filter((gen) => gen !== firstGen && gen <= firstGen + 2)
    .forEach((gen) => {
      const groups = (groupsByGen.get(gen) || [])
        .slice()
        .sort((a, b) => {
          const boundsA = groupBounds(a);
          const boundsB = groupBounds(b);
          return ((boundsA?.minX || 0) + (boundsA?.maxX || 0)) / 2
            - ((boundsB?.minX || 0) + (boundsB?.maxX || 0)) / 2;
        });
      const totalWidth = groups.reduce((sum, group) => sum + groupWidth(group), 0)
        + ROW_CENTER_GAP * Math.max(0, groups.length - 1);
      let x = axisX - totalWidth / 2;
      groups.forEach((group) => {
        group.forEach((id, index) => {
          const position = positions.get(id);
          if (position) position.x = x + index * (CARD_W + SPOUSE_GAP);
        });
        x += groupWidth(group) + ROW_CENTER_GAP;
      });
    });
  const groupById = new Map();
  groupsByGen.forEach((groups) => {
    groups.forEach((group) => {
      group.forEach((id) => groupById.set(id, group));
    });
  });
  const relationChildren = new Map();
  people.forEach((person) => {
    const key = parentKeyOf(person);
    if (!key) return;
    if (!relationChildren.has(key)) relationChildren.set(key, []);
    relationChildren.get(key).push(person);
  });
  const relationChildGroups = (childPeople) => Array.from(new Set(
    childPeople.map((child) => groupById.get(child.id) || [child.id]),
  ));
  const alignLowerRelations = () => {
    relationChildren.forEach((childPeople, key) => {
      const childGen = Math.min(...childPeople.map((child) => generation.get(child.id) ?? 0));
      if (childGen <= firstGen + 2) return;
      const target = parentCenterForKey(key);
      if (target === null) return;
      const childBounds = relationChildGroups(childPeople)
        .map(groupBounds)
        .filter(Boolean);
      if (!childBounds.length) return;
      const childCenter = (
        Math.min(...childBounds.map((item) => item.minX))
        + Math.max(...childBounds.map((item) => item.maxX))
      ) / 2;
      const delta = target - childCenter;
      if (Math.abs(delta) < 1) return;
      relationChildGroups(childPeople).forEach((group) => shiftGroup(group, delta));
    });
  };
  const enforceRelationOrder = () => {
    Array.from(groupsByGen.keys()).sort((a, b) => a - b).forEach((gen) => {
      if (gen === firstGen) return;
      const blocks = [];
      relationChildren.forEach((childPeople, key) => {
        const childGen = Math.min(...childPeople.map((child) => generation.get(child.id) ?? 0));
        if (childGen !== gen) return;
        const target = parentCenterForKey(key);
        if (target === null) return;
        const groups = relationChildGroups(childPeople);
        const bounds = groups.map(groupBounds).filter(Boolean);
        if (!bounds.length) return;
        blocks.push({
          key,
          groups,
          target,
          minX: Math.min(...bounds.map((item) => item.minX)),
          maxX: Math.max(...bounds.map((item) => item.maxX)),
        });
      });
      blocks.sort((a, b) => a.target - b.target || a.minX - b.minX);
      const relationGap = Math.max(GROUP_GAP, CARD_W * 0.42);
      const blockWidth = (block) => block.maxX - block.minX;
      const moveBlock = (block, nextMin) => {
        const delta = nextMin - block.minX;
        if (Math.abs(delta) <= 0.5) return;
        block.groups.forEach((group) => shiftGroup(group, delta));
        block.minX += delta;
        block.maxX += delta;
      };
      const shouldCenterRow = gen <= firstGen + 2 || blocks.length >= 5;
      if (shouldCenterRow) {
        const totalWidth = blocks.reduce((sum, block) => sum + blockWidth(block), 0)
          + relationGap * Math.max(0, blocks.length - 1);
        let cursor = axisX - totalWidth / 2;
        blocks.forEach((block) => {
          moveBlock(block, cursor);
          cursor = block.maxX + relationGap;
        });
        return;
      }
      blocks.forEach((block) => moveBlock(block, block.target - blockWidth(block) / 2));
      for (let index = 1; index < blocks.length; index++) {
        const previous = blocks[index - 1];
        const current = blocks[index];
        const overlap = previous.maxX + relationGap - current.minX;
        if (overlap > 0) moveBlock(current, current.minX + overlap);
      }
    });
  };
  const resolveLowerCollisions = () => {
    const gap = Math.max(12, Math.round(GROUP_GAP * 0.2));
    Array.from(groupsByGen.keys()).sort((a, b) => a - b).forEach((gen) => {
      if (gen <= firstGen + 2) return;
      const items = (groupsByGen.get(gen) || [])
        .map((group) => ({ group, bounds: groupBounds(group) }))
        .filter((item) => item.bounds)
        .sort((a, b) => a.bounds.minX - b.bounds.minX);
      for (let index = 1; index < items.length; index++) {
        const previous = items[index - 1];
        const current = items[index];
        const overlap = previous.bounds.maxX + gap - current.bounds.minX;
        if (overlap > 0) {
          shiftGroup(current.group, overlap);
          current.bounds.minX += overlap;
          current.bounds.maxX += overlap;
        }
      }
    });
  };
  for (let pass = 0; pass < 5; pass++) {
    enforceRelationOrder();
    alignLowerRelations();
    resolveLowerCollisions();
  }
  const descendantPositions = Array.from(positions.values()).filter((position) => position.gen !== firstGen);
  if (descendantPositions.length) {
    const descendantMinX = Math.min(...descendantPositions.map((position) => position.x));
    const descendantMaxX = Math.max(...descendantPositions.map((position) => position.x + position.w));
    const descendantCenter = (descendantMinX + descendantMaxX) / 2;
    const delta = axisX - descendantCenter;
    if (Math.abs(delta) > 1) {
      positions.forEach((position) => {
        if (position.gen !== firstGen) position.x += delta;
      });
    }
  }
  const finalMinX = Math.min(...Array.from(positions.values()).map((position) => position.x), PADDING);
  if (finalMinX < PADDING) {
    const delta = PADDING - finalMinX;
    positions.forEach((position) => {
      position.x += delta;
    });
    axisX += delta;
  }
  maxX = Math.max(...Array.from(positions.values()).map((position) => position.x + position.w), PADDING);
  const contentBounds = Array.from(positions.values()).reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxX: Math.max(bounds.maxX, position.x + position.w),
    maxY: Math.max(bounds.maxY, position.y + position.h),
  }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
  if (!Number.isFinite(contentBounds.minX)) {
    contentBounds.minX = PADDING;
    contentBounds.minY = PADDING;
    contentBounds.maxX = PADDING;
    contentBounds.maxY = PADDING;
  }
  const balanceRadius = Math.max(
    axisX - contentBounds.minX,
    contentBounds.maxX - axisX,
    CARD_W,
  );
  contentBounds.minX = axisX - balanceRadius;
  contentBounds.maxX = axisX + balanceRadius;
  maxX = Math.max(maxX, contentBounds.maxX);

  const result = {
    byId,
    children,
    positions,
    groupsByGen,
    cardW: CARD_W,
    cardH: CARD_H,
    photoW: PHOTO_W,
    photoH: PHOTO_H,
    axisX,
    contentBounds,
    width: Math.max(maxX + PADDING, 900),
    height: Math.max(maxY + PADDING, 600),
  };
  state.layoutCache = { people, value: result };
  return result;
}

function selectOptions(values, selected, emptyLabel = "Chưa cập nhật") {
  return `<option value="">${esc(emptyLabel)}</option>${values.map((value) => `
    <option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(value === "PGS" ? "Phó Giáo sư (PGS)" : value === "GS" ? "Giáo sư (GS)" : value)}</option>
  `).join("")}`;
}

function renderPublic() {
  const stats = getStats();
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(false)}
      <main class="workspace">
        ${renderControlMenu(stats)}
        ${state.view === "tree" ? renderTree() : state.view === "list" ? renderList() : renderHonorBoard()}
      </main>
      ${renderViewSwitchFloatButton()}
      ${renderKinshipFloatButton()}
      ${state.selectedId ? renderDetail(state.selectedId) : ""}
      ${state.kinshipOpen ? renderKinshipLookup() : ""}
      ${renderPhotoViewer()}
      <div id="toastRoot"></div>
    </div>
  `;
  bindPublic();
  applyTransform();
}

function renderViewerAuth() {
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(false)}
      <main class="login-screen viewer-login-screen">
        <form class="login-panel viewer-login-panel" id="viewerAuthForm">
          <h2>Đăng nhập xem gia phả</h2>
          <p class="notice">Tài khoản xem gia phả do admin tạo. Để đăng nhập, hãy liên hệ cháu Nguyễn Văn Tình 0382967057 để lấy tài khoản và mật khẩu đăng nhập.</p>
          ${state.viewerSessionError ? `<p class="notice login-warning">${esc(state.viewerSessionError)}</p>` : ""}
          <div class="field"><label>Tài khoản</label><input name="username" autocomplete="username" required></div>
          <div class="field"><label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required></div>
          <div class="form-actions">
            <button class="btn" type="submit">Đăng nhập</button>
          </div>
        </form>
        <div id="toastRoot"></div>
      </main>
    </div>
  `;
  $("#viewerAuthForm").addEventListener("submit", handleViewerAuth);
}

function renderControlMenu(stats) {
  const suggestions = publicSearchResults().slice(0, 6);
  return `
    <section class="floating-tools ${state.menuOpen ? "open" : ""}">
      <button class="menu-toggle" id="menuToggle" type="button" title="Công cụ" aria-label="Công cụ">${icon("menu")}</button>
      <div class="menu-panel">
        <div class="menu-section">
          <h3>Tìm kiếm</h3>
          <label class="searchbar compact-search">
            <span class="search-icon" title="Tìm kiếm">${icon("search")}</span>
            <input id="searchInput" value="${esc(state.query)}" placeholder="Tên, địa chỉ, nghề nghiệp..." autocomplete="off">
          </label>
          ${state.query.trim() ? `
            <div class="viewer-suggestions">
              ${suggestions.length ? suggestions.map((person) => `
                <button class="viewer-suggestion" type="button" data-person-id="${esc(person.id)}">
                  <strong>${esc(person.fullName)}</strong>
                  <span>${esc([person.familyRole, childOrderText(person), formatDate(person.birthDate)].filter(Boolean).join(" · ") || "Chưa cập nhật")}</span>
                </button>
              `).join("") : `<p class="notice search-empty">Không thấy người phù hợp. Thử gỡ dấu hoặc nhập ít chữ hơn.</p>`}
            </div>
          ` : ""}
        </div>
        <div class="menu-section">
          <h3>Kiểu xem</h3>
          <div class="segmented">
            <button class="icon-btn ${state.view === "tree" ? "active" : ""}" data-view="tree" title="Sơ đồ" aria-label="Sơ đồ">${icon("tree")}</button>
            <button class="icon-btn ${state.view === "list" ? "active" : ""}" data-view="list" title="Danh sách" aria-label="Danh sách">${icon("list")}</button>
            <button class="icon-btn ${state.view === "honor" ? "active" : ""}" data-view="honor" title="Bảng vàng vinh danh" aria-label="Bảng vàng vinh danh">${icon("award")}</button>
          </div>
        </div>
        ${state.view === "tree" ? `<div class="menu-section">
          <h3>Thu phóng</h3>
          <div class="zoom-controls">
            <button class="icon-btn" data-zoom="out" title="Thu nhỏ" aria-label="Thu nhỏ">${icon("minus")}</button>
            <button class="icon-btn" data-zoom="fit" title="Vừa khung" aria-label="Vừa khung">${icon("fit")}</button>
            <button class="icon-btn" data-zoom="in" title="Phóng to" aria-label="Phóng to">${icon("plus")}</button>
          </div>
        </div>` : ""}
        <div class="menu-section">
          <h3>Công cụ</h3>
          <div class="tool-grid">
            <button class="icon-btn tool-action" id="exportExcelBtn" type="button" title="Xuất Excel" aria-label="Xuất Excel">${icon("download")}</button>
          </div>
        </div>
        <div class="menu-section stats-menu">
          <h3>Thông tin</h3>
          <div><strong>${stats.people}</strong><span>Người trong gia phả</span></div>
          <div><strong>${stats.childCount}</strong><span>Có thông tin bố/mẹ</span></div>
          <div><strong>${stats.marriedCount}</strong><span>Có quan hệ vợ/chồng</span></div>
          <div><strong>${stats.achievementCount}</strong><span>Có thành tích cấp huyện trở lên</span></div>
        </div>
        <div class="menu-section menu-help">Kéo để di chuyển, chụm hai ngón để thu phóng, hoặc dùng nút mũi tên.</div>
      </div>
    </section>
  `;
}

function renderViewSwitchFloatButton() {
  const showingHonor = state.view === "honor";
  const label = showingHonor ? "Trở về gia phả" : "Mở Bảng vàng vinh danh";
  return `
    <button class="view-switch-fab" id="viewSwitchFloatBtn" type="button" title="${label}" aria-label="${label}">
      ${icon(showingHonor ? "tree" : "award")}
      <span>${label}</span>
    </button>
  `;
}

function renderKinshipFloatButton() {
  return `
    <button class="kinship-fab" id="kinshipFloatBtn" type="button" title="Tra cứu cách xưng hô" aria-label="Tra cứu cách xưng hô">
      ${icon("users")}
      <span>Tra cứu cách xưng hô</span>
    </button>
  `;
}

function topbar(admin) {
  const viewerName = state.viewerUser?.displayName || state.viewerUser?.username || "";
  const adminName = state.currentAdmin?.displayName || state.currentAdmin?.username || "";
  return `
    <header class="topbar">
      <a class="brand" href="${state.staticMode ? "./" : "/"}">
        <div class="brand-mark">NH</div>
        <div>
          <h1>${esc(state.data.familyName || "Gia phả dòng họ Nguyễn Hữu")}</h1>
          <p>${admin ? (adminName ? `${esc(adminName)} · ${roleLabel(state.currentAdmin?.role, state.currentAdmin?.isRoot)}` : "Khu vực cập nhật thông tin gia phả") : viewerName ? `Xin chào ${esc(viewerName)}` : "Đăng nhập để xem gia phả"}</p>
        </div>
      </a>
      <nav class="nav-actions">
        <a class="ghost-btn" href="${state.staticMode ? "./" : "/"}">Trang xem</a>
        ${state.staticMode ? "" : `<a class="btn" href="/admin">Admin</a>`}
        ${!admin && state.viewerAuthenticated ? `<button class="ghost-btn" id="viewerLogoutBtn" type="button">Đăng xuất</button>` : ""}
        ${admin && state.authenticated ? `<button class="ghost-btn" id="logoutBtn">Đăng xuất</button>` : ""}
      </nav>
    </header>
  `;
}

function personMatches(person) {
  if (!state.query.trim()) return true;
  return adminSearchScore(person, state.query) > 0;
}

function publicSearchResults() {
  const query = state.query.trim();
  if (!query) return [];
  return state.data.people
    .map((person) => ({ person, score: adminSearchScore(person, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || rankCompare(a.person, b.person))
    .map((item) => item.person);
}

function sortedPeopleByRank() {
  if (!state.data.people.length) return [];
  const layout = buildLayout();
  return state.data.people.slice().sort((a, b) => rankCompare(a, b, layout));
}

function rankCompare(a, b, layout = null) {
  const positions = layout?.positions;
  const posA = positions?.get(a.id);
  const posB = positions?.get(b.id);
  const genDiff = (posA?.gen ?? 999) - (posB?.gen ?? 999);
  if (genDiff !== 0) return genDiff;
  const xDiff = (posA?.x ?? 0) - (posB?.x ?? 0);
  if (Math.abs(xDiff) > 1) return xDiff;
  const birthDiff = birthSortValue(a) - birthSortValue(b);
  if (birthDiff !== 0) return birthDiff;
  return a.fullName.localeCompare(b.fullName, "vi");
}

function kinshipOptions(selectedId) {
  return `<option value="">Chọn người</option>${sortedPeopleByRank().map((person) => `
    <option value="${esc(person.id)}" ${person.id === selectedId ? "selected" : ""}>${esc(person.fullName)}${person.familyRole ? ` - ${esc(person.familyRole)}` : ""}</option>
  `).join("")}`;
}

function searchableSelect(selectHtml, placeholder = "Tìm tên...") {
  return `<div class="searchable-person-select"><label class="select-search">${icon("search")}<input type="search" class="person-select-filter" placeholder="${esc(placeholder)}" autocomplete="off"></label>${selectHtml}</div>`;
}

function bindSearchableSelects() {
  $$(".person-select-filter").forEach((input) => {
    input.addEventListener("input", () => {
      const select = input.closest(".searchable-person-select")?.querySelector("select");
      if (!select) return;
      const query = normalizeText(input.value).trim();
      Array.from(select.options).forEach((option, index) => {
        option.hidden = index > 0 && option.value !== select.value && !!query && !normalizeText(option.textContent).includes(query);
      });
    });
  });
}

function renderKinshipLookup() {
  const personA = personById(state.kinshipPersonAId);
  const personB = personById(state.kinshipPersonBId);
  const result = kinshipResult(personA, personB);
  return `
    <div class="kinship-modal" role="dialog" aria-modal="true" aria-label="Tra cứu cách xưng hô">
      <button class="kinship-backdrop" id="closeKinshipBackdrop" type="button" aria-label="Đóng tra cứu"></button>
      <section class="kinship-panel">
        <div class="kinship-head">
          <div>
            <h2>${icon("users")}Tra cứu cách xưng hô</h2>
            <p>Nhánh họ Nguyễn Hữu, ông Nguyễn Văn Hữu - Kỳ Văn, Kỳ Anh, Hà Tĩnh.</p>
          </div>
          <button class="ghost-btn" id="closeKinshipBtn" type="button">Đóng</button>
        </div>
        <div class="kinship-fields">
          <div class="field"><label>Người thứ nhất</label>${searchableSelect(`<select id="kinshipPersonA">${kinshipOptions(state.kinshipPersonAId)}</select>`)}</div>
          <div class="field"><label>Người thứ hai</label>${searchableSelect(`<select id="kinshipPersonB">${kinshipOptions(state.kinshipPersonBId)}</select>`)}</div>
        </div>
        <div class="kinship-result">
          ${result}
        </div>
      </section>
    </div>
  `;
}

function kinshipResult(personA, personB) {
  if (!personA || !personB) return `<p class="notice">Chọn đủ hai người để xem cách xưng hô.</p>`;
  if (personA.id === personB.id) return `<p><strong>${esc(personA.fullName)}</strong> là cùng một người.</p>`;
  const speechAB = kinshipSpeech(personA, personB);
  const speechBA = kinshipSpeech(personB, personA);
  return `
    <div class="kinship-answer">
      <p><strong>${esc(personA.fullName)}</strong> gọi <strong>${esc(personB.fullName)}</strong> là <b>${esc(speechAB.call)}</b>, xưng <b>${esc(speechAB.self)}</b>.</p>
      <p><strong>${esc(personB.fullName)}</strong> gọi <strong>${esc(personA.fullName)}</strong> là <b>${esc(speechBA.call)}</b>, xưng <b>${esc(speechBA.self)}</b>.</p>
      <span>Vai Anh/Chị/Em họ được kế thừa từ thứ tự của hai nhánh tại đời tổ tiên chung, không đổi theo tuổi của người đang tra cứu. Quan hệ vợ chồng gọi theo vai của người trong họ.</span>
    </div>
  `;
}

function ancestorsOf(person) {
  const result = new Map();
  const visit = (id, depth) => {
    if (!id || result.has(id)) return;
    result.set(id, depth);
    const current = personById(id);
    if (!current) return;
    visit(current.fatherId, depth + 1);
    visit(current.motherId, depth + 1);
  };
  visit(person?.id, 0);
  return result;
}

function kinshipTerm(speaker, target) {
  if (!speaker || !target) return "chưa rõ";
  if (areSpouses(speaker, target)) return target.gender === "Nam" ? "Chồng" : "Vợ";

  const direct = bloodKinshipTerm(speaker, target);
  if (direct) return direct;

  // A person married into the family normally calls relatives as their spouse does.
  for (const spouseId of speaker.spouseIds || []) {
    const spouse = personById(spouseId);
    const inheritedTerm = bloodKinshipTerm(spouse, target);
    if (inheritedTerm) return inheritedTerm;
  }

  // The title of an in-law follows the blood relative they married.
  for (const spouseId of target.spouseIds || []) {
    const targetSpouse = personById(spouseId);
    const directSpouseTerm = bloodKinshipTerm(speaker, targetSpouse);
    if (directSpouseTerm) return inLawTerm(directSpouseTerm, target);

    for (const speakerSpouseId of speaker.spouseIds || []) {
      const speakerSpouse = personById(speakerSpouseId);
      const sharedInLawTerm = bloodKinshipTerm(speakerSpouse, targetSpouse);
      if (sharedInLawTerm) return inLawTerm(sharedInLawTerm, target);
    }
  }
  return "họ hàng trong nhánh Nguyễn Hữu";
}

function kinshipSpeech(speaker, target) {
  const call = kinshipTerm(speaker, target);
  return {
    call,
    self: kinshipSelfPronoun(speaker, target, call),
  };
}

function kinshipSelfPronoun(speaker, target, call) {
  const reciprocal = kinshipTerm(target, speaker);
  if (!reciprocal || reciprocal === "chưa rõ") return "Chưa rõ";
  if (reciprocal === "họ hàng trong nhánh Nguyễn Hữu") return "Người trong họ";
  return reciprocal.charAt(0).toUpperCase() + reciprocal.slice(1);
}

function areSpouses(personA, personB) {
  if (!personA || !personB) return false;
  return (personA.spouseIds || []).includes(personB.id) || (personB.spouseIds || []).includes(personA.id);
}

function bloodKinshipTerm(speaker, target) {
  if (!speaker || !target) return "";
  const speakerAncestors = ancestorsOf(speaker);
  const targetAncestors = ancestorsOf(target);
  if (speakerAncestors.has(target.id)) return ancestorTerm(speaker, target, speakerAncestors.get(target.id));
  if (targetAncestors.has(speaker.id)) return descendantTerm(targetAncestors.get(speaker.id));
  if (siblingKey(speaker) && siblingKey(speaker) === siblingKey(target)) return siblingTerm(speaker, target, "");

  let best = null;
  speakerAncestors.forEach((speakerDepth, ancestorId) => {
    if (!targetAncestors.has(ancestorId) || ancestorId === speaker.id || ancestorId === target.id) return;
    const targetDepth = targetAncestors.get(ancestorId);
    const score = speakerDepth + targetDepth;
    if (!best || score < best.score) best = { ancestorId, speakerDepth, targetDepth, score };
  });
  if (!best) return "";
  if (best.speakerDepth === best.targetDepth) {
    return collateralSameGenerationTerm(speaker, target, best, best.speakerDepth > 1 ? " họ" : "");
  }
  const diff = best.speakerDepth - best.targetDepth;
  if (diff > 0) return collateralOlderTerm(speaker, target, best);
  return collateralYoungerTerm(-diff);
}

function ancestorTerm(speaker, target, depth) {
  if (depth === 1) return target.gender === "Nam" ? "Bố" : "Mẹ";
  if (depth === 2) {
    const parent = directChildBetween(speaker, target);
    const side = parent?.gender === "Nam" ? "nội" : "ngoại";
    return target.gender === "Nam" ? `Ông ${side}` : `Bà ${side}`;
  }
  if (depth === 3) return "Cố";
  if (depth === 4) return "Kỵ";
  return "Cao tổ";
}

function descendantTerm(depth) {
  if (depth === 1) return "con";
  if (depth === 2) return "cháu";
  if (depth === 3) return "chắt";
  if (depth === 4) return "chút";
  return "chít";
}

function siblingTerm(speaker, target, suffix) {
  const speakerBirth = birthSortValue(speaker);
  const targetBirth = birthSortValue(target);
  const targetOlder = targetBirth < speakerBirth;
  if (targetOlder) return `${target.gender === "Nam" ? "Anh" : "Chị"}${suffix}`;
  if (targetBirth > speakerBirth) return `Em${suffix}`;
  return target.gender === "Nam" ? `Anh/Em${suffix}` : `Chị/Em${suffix}`;
}

function lineagePathToAncestor(personId, ancestorId, visited = new Set()) {
  if (!personId || visited.has(personId)) return null;
  visited.add(personId);
  const person = personById(personId);
  if (!person) return null;
  if (person.id === ancestorId) return [person];
  for (const parentId of [person.fatherId, person.motherId]) {
    const parentPath = lineagePathToAncestor(parentId, ancestorId, new Set(visited));
    if (parentPath) return [person, ...parentPath];
  }
  return null;
}

function branchChildUnder(descendant, ancestorId) {
  const path = lineagePathToAncestor(descendant?.id, ancestorId);
  return path?.length >= 2 ? path[path.length - 2] : null;
}

function lineageBranchComparison(speaker, target, ancestorId) {
  const speakerBranch = branchChildUnder(speaker, ancestorId);
  const targetBranch = branchChildUnder(target, ancestorId);
  if (!speakerBranch || !targetBranch || speakerBranch.id === targetBranch.id) return 0;
  const speakerBirth = birthSortValue(speakerBranch);
  const targetBirth = birthSortValue(targetBranch);
  const unknown = Number.MAX_SAFE_INTEGER;
  if (speakerBirth === unknown || targetBirth === unknown || speakerBirth === targetBirth) return 0;
  return speakerBirth < targetBirth ? -1 : 1;
}

function collateralSameGenerationTerm(speaker, target, relation, suffix) {
  const branchComparison = lineageBranchComparison(speaker, target, relation.ancestorId);
  if (branchComparison < 0) return `Em${suffix}`;
  if (branchComparison > 0) return `${target.gender === "Nam" ? "Anh" : "Chị"}${suffix}`;
  return target.gender === "Nam" ? `Anh/Em${suffix}` : `Chị/Em${suffix}`;
}

function collateralOlderTerm(speaker, target, relation) {
  const generationGap = relation.speakerDepth - relation.targetDepth;
  if (generationGap === 2) return target.gender === "Nam" ? "Ông" : "Bà";
  if (generationGap === 3) return "Cố";
  if (generationGap === 4) return "Kỵ";
  if (generationGap > 4) return "Cao tổ";
  const speakerParent = parentOnPath(speaker.id, relation.ancestorId);
  const branchComparison = lineageBranchComparison(speaker, target, relation.ancestorId);
  const targetBranchIsOlder = branchComparison > 0;
  if (speakerParent?.gender === "Nữ") return target.gender === "Nam" ? "Cậu" : "Dì";
  if (target.gender !== "Nam") return "O";
  if (branchComparison === 0) return "Bác/Chú";
  return targetBranchIsOlder ? "Bác" : "Chú";
}

function collateralYoungerTerm(depthDiff) {
  if (depthDiff <= 2) return "cháu";
  if (depthDiff === 3) return "chắt";
  if (depthDiff === 4) return "chút";
  return "chít";
}

function parentOnPath(personId, ancestorId) {
  let current = personById(personId);
  while (current) {
    const fatherAncestors = ancestorsOf(personById(current.fatherId));
    if (fatherAncestors.has(ancestorId)) return personById(current.fatherId);
    const motherAncestors = ancestorsOf(personById(current.motherId));
    if (motherAncestors.has(ancestorId)) return personById(current.motherId);
    break;
  }
  return null;
}

function directChildBetween(descendant, ancestor) {
  const father = personById(descendant?.fatherId);
  const mother = personById(descendant?.motherId);
  if (father && (father.fatherId === ancestor.id || father.motherId === ancestor.id)) return father;
  if (mother && (mother.fatherId === ancestor.id || mother.motherId === ancestor.id)) return mother;
  return null;
}
function inLawTerm(baseTerm, target) {
  const isMale = target.gender === "Nam";
  if (baseTerm.startsWith("Anh")) return isMale ? "Anh" : "Chị";
  if (baseTerm.startsWith("Chị")) return isMale ? "Anh" : "Chị";
  if (baseTerm.startsWith("Em")) return "Em";
  if (baseTerm === "Bác") return "Bác";
  if (baseTerm === "Chú") return isMale ? "Chú" : "Mự";
  if (baseTerm === "O" || baseTerm === "Dì") return isMale ? "Dượng" : baseTerm;
  if (baseTerm === "Cậu") return isMale ? "Cậu" : "Mợ";
  if (baseTerm === "Bố" || baseTerm === "Mẹ") return isMale ? "Bố" : "Mẹ";
  if (baseTerm.startsWith("Ông ") || baseTerm.startsWith("Bà ")) {
    const side = baseTerm.includes("ngoại") ? "ngoại" : "nội";
    return isMale ? `Ông ${side}` : `Bà ${side}`;
  }
  if (["Cố", "Kỵ", "Cao tổ"].includes(baseTerm)) return baseTerm;
  if (["con", "cháu", "chắt", "chút", "chít", "chút/chít"].includes(baseTerm)) return baseTerm;
  return baseTerm;
}

function rangesOverlap(a, b, gap = 0) {
  return a.start <= b.end + gap && b.start <= a.end + gap;
}

function routeTreeEdgeGroups(edges) {
  const HORIZONTAL_GAP = 22;
  const LANE_GAP = 16;
  const CROSS_GAP = 5;
  const groups = new Map();

  edges.forEach((edge) => {
    const key = `${edge.relationKey}|${Math.round(edge.parentY)}|${Math.round(edge.childY)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        relationKey: edge.relationKey,
        parentX: edge.parentX,
        parentY: edge.parentY,
        childY: edge.childY,
        childXs: [],
      });
    }
    groups.get(key).childXs.push(edge.childX);
  });

  const routed = Array.from(groups.values()).map((group) => {
    const childXs = [...new Set(group.childXs)].sort((a, b) => a - b);
    const span = {
      start: Math.min(group.parentX, ...childXs),
      end: Math.max(group.parentX, ...childXs),
    };
    return { ...group, childXs, span, lane: 0, midY: 0 };
  });

  const bands = new Map();
  routed.forEach((group) => {
    const key = `${Math.round(group.parentY)}|${Math.round(group.childY)}`;
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key).push(group);
  });

  const routedHorizontals = [];
  const routedVerticals = [];
  const between = (value, a, b, gap = 0) => value >= Math.min(a, b) - gap && value <= Math.max(a, b) + gap;
  const inSpan = (value, span, gap = 0) => value >= span.start - gap && value <= span.end + gap;
  const verticalSegmentsFor = (group, midY) => [
    { x: group.parentX, startY: group.parentY, endY: midY, group },
    ...group.childXs.map((childX) => ({ x: childX, startY: midY, endY: group.childY - 8, group })),
  ];
  const candidateYs = (top, bottom) => {
    if (bottom <= top) return [Math.round(top)];
    const values = [];
    const center = top + (bottom - top) / 2;
    const add = (value) => {
      const rounded = Math.round(value * 10) / 10;
      if (rounded < top || rounded > bottom || values.includes(rounded)) return;
      values.push(rounded);
    };
    add(center);
    for (let offset = LANE_GAP; offset <= bottom - top + LANE_GAP; offset += LANE_GAP) {
      add(center - offset);
      add(center + offset);
    }
    for (let y = top; y <= bottom; y += LANE_GAP) add(y);
    add(bottom);
    return values;
  };
  const conflictScore = (group, midY) => {
    const span = group.span;
    const verticals = verticalSegmentsFor(group, midY);
    let score = 0;
    routedHorizontals.forEach((line) => {
      if (Math.abs(line.y - midY) < LANE_GAP && rangesOverlap(line, span, HORIZONTAL_GAP)) score += 1200;
      verticals.forEach((vertical) => {
        if (inSpan(vertical.x, line, CROSS_GAP) && between(line.y, vertical.startY, vertical.endY, CROSS_GAP)) score += 500;
      });
    });
    routedVerticals.forEach((line) => {
      if (inSpan(line.x, span, CROSS_GAP) && between(midY, line.startY, line.endY, CROSS_GAP)) score += 500;
      verticals.forEach((vertical) => {
        if (Math.abs(vertical.x - line.x) < CROSS_GAP && rangesOverlap(
          { start: Math.min(vertical.startY, vertical.endY), end: Math.max(vertical.startY, vertical.endY) },
          { start: Math.min(line.startY, line.endY), end: Math.max(line.startY, line.endY) },
          CROSS_GAP,
        )) score += 260;
      });
    });
    return score;
  };
  const groupHorizontal = (group, midY = group.midY) => ({ ...group.span, y: midY, group });
  const globalConflictScore = (group, midY) => {
    const horizontal = groupHorizontal(group, midY);
    const verticals = verticalSegmentsFor(group, midY);
    const ideal = group.routeTop + (group.routeBottom - group.routeTop) / 2;
    let score = Math.abs(midY - ideal) * 0.2;

    routed.forEach((other) => {
      if (other === group || !Number.isFinite(other.midY)) return;
      const otherHorizontal = groupHorizontal(other);
      const otherVerticals = verticalSegmentsFor(other, other.midY);
      if (Math.abs(otherHorizontal.y - horizontal.y) < LANE_GAP && rangesOverlap(otherHorizontal, horizontal, HORIZONTAL_GAP)) {
        score += 1600;
      }
      otherVerticals.forEach((vertical) => {
        if (inSpan(vertical.x, horizontal, CROSS_GAP) && between(horizontal.y, vertical.startY, vertical.endY, CROSS_GAP)) {
          score += 1200;
        }
      });
      verticals.forEach((vertical) => {
        if (inSpan(vertical.x, otherHorizontal, CROSS_GAP) && between(otherHorizontal.y, vertical.startY, vertical.endY, CROSS_GAP)) {
          score += 1200;
        }
        otherVerticals.forEach((otherVertical) => {
          if (Math.abs(vertical.x - otherVertical.x) < CROSS_GAP && rangesOverlap(
            { start: Math.min(vertical.startY, vertical.endY), end: Math.max(vertical.startY, vertical.endY) },
            { start: Math.min(otherVertical.startY, otherVertical.endY), end: Math.max(otherVertical.startY, otherVertical.endY) },
            CROSS_GAP,
          )) {
            score += 360;
          }
        });
      });
    });
    return score;
  };

  bands.forEach((bandGroups) => {
    const top = Math.min(...bandGroups.map((group) => group.parentY)) + 26;
    const bottom = Math.max(...bandGroups.map((group) => group.childY)) - 44;
    bandGroups.forEach((group) => {
      group.routeTop = top;
      group.routeBottom = bottom;
    });
    bandGroups
      .sort((a, b) => {
        const widthDiff = (b.span.end - b.span.start) - (a.span.end - a.span.start);
        if (widthDiff !== 0) return widthDiff;
        return a.span.start - b.span.start;
      })
      .forEach((group) => {
        const candidates = candidateYs(top, bottom);
        const best = candidates
          .map((midY) => ({ midY, score: conflictScore(group, midY), distance: Math.abs(midY - (top + bottom) / 2) }))
          .sort((a, b) => a.score - b.score || a.distance - b.distance)[0];
        group.midY = best?.midY ?? Math.round((top + bottom) / 2);
        routedHorizontals.push({ ...group.span, y: group.midY, group });
        routedVerticals.push(...verticalSegmentsFor(group, group.midY));
      });
  });

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    routed
      .slice()
      .sort((a, b) => (b.span.end - b.span.start) - (a.span.end - a.span.start))
      .forEach((group) => {
        const candidates = candidateYs(group.routeTop, group.routeBottom);
        const best = candidates
          .map((midY) => ({
            midY,
            score: globalConflictScore(group, midY),
            distance: Math.abs(midY - (group.routeTop + group.routeBottom) / 2),
          }))
          .sort((a, b) => a.score - b.score || a.distance - b.distance)[0];
        if (best && Math.abs(best.midY - group.midY) > 0.5) {
          group.midY = best.midY;
          changed = true;
        }
      });
    if (!changed) break;
  }

  return routed;
}

function renderTree() {
  if (!state.data.people.length) return `<section class="empty-state list-panel">Chưa có dữ liệu gia phả.</section>`;
  const layout = buildLayout();
  const queryActive = state.query.trim();
  const spouseLines = [];
  const rawEdges = [];

  state.data.people.forEach((person) => {
    const pos = layout.positions.get(person.id);
    if (!pos) return;
    (person.spouseIds || []).forEach((spouseId) => {
      if (person.id > spouseId) return;
      const spousePos = layout.positions.get(spouseId);
      if (!spousePos || spousePos.y !== pos.y) return;
      const left = pos.x <= spousePos.x ? pos : spousePos;
      const right = left === pos ? spousePos : pos;
      spouseLines.push(`<line class="spouse-line" x1="${left.x + left.w}" y1="${left.y + left.h / 2}" x2="${right.x}" y2="${right.y + right.h / 2}"></line>`);
    });

    const fatherPos = layout.positions.get(person.fatherId);
    const motherPos = layout.positions.get(person.motherId);
    const parentPositions = [fatherPos, motherPos].filter(Boolean);
    if (!parentPositions.length) return;
    const parentX = parentPositions.reduce((sum, item) => sum + item.x + item.w / 2, 0) / parentPositions.length;
    const parentY = Math.max(...parentPositions.map((item) => item.y + item.h));
    const childX = pos.x + pos.w / 2;
    const childY = pos.y;
    const relationKey = `${person.fatherId || "_"}|${person.motherId || "_"}`;
    rawEdges.push({
      relationKey,
      fatherId: person.fatherId || "",
      parentX,
      parentY,
      childX,
      childY,
    });
  });

  const routedEdgeGroups = routeTreeEdgeGroups(rawEdges);
  const edgeMaxY = routedEdgeGroups.reduce((max, group) => Math.max(max, group.midY || 0, group.childY || 0, group.parentY || 0), 0);
  layout.height = Math.max(layout.height, edgeMaxY + 96);
  routedEdgeGroups.forEach((group) => {
    layout.contentBounds.minX = Math.min(layout.contentBounds.minX, group.parentX, ...group.childXs);
    layout.contentBounds.maxX = Math.max(layout.contentBounds.maxX, group.parentX, ...group.childXs);
    layout.contentBounds.minY = Math.min(layout.contentBounds.minY, group.parentY, group.midY);
    layout.contentBounds.maxY = Math.max(layout.contentBounds.maxY, group.childY, group.midY);
  });
  const balancedRadius = Math.max(
    layout.axisX - layout.contentBounds.minX,
    layout.contentBounds.maxX - layout.axisX,
    layout.cardW,
  );
  layout.contentBounds.minX = layout.axisX - balancedRadius;
  layout.contentBounds.maxX = layout.axisX + balancedRadius;
  layout.width = Math.max(layout.width, layout.contentBounds.maxX + 80, 900);

  const edgeVerticals = routedEdgeGroups.flatMap((group, groupIndex) => [
    { groupIndex, x: group.parentX, startY: group.parentY, endY: group.midY },
    ...group.childXs.map((childX) => ({ groupIndex, x: childX, startY: group.midY, endY: group.childY - 8 })),
  ]);
  const horizontalPathWithBreaks = (startX, endX, y, groupIndex) => {
    const GAP = 13;
    const points = edgeVerticals
      .filter((segment) => segment.groupIndex !== groupIndex)
      .filter((segment) => segment.x > startX + GAP && segment.x < endX - GAP)
      .filter((segment) => y > Math.min(segment.startY, segment.endY) + 4 && y < Math.max(segment.startY, segment.endY) - 4)
      .map((segment) => segment.x)
      .sort((a, b) => a - b);
    let cursor = startX;
    const parts = [];
    points.forEach((x) => {
      const breakStart = Math.max(cursor, x - GAP);
      const breakEnd = x + GAP;
      if (breakStart - cursor > 1) parts.push(`M ${cursor} ${y} H ${breakStart}`);
      cursor = Math.max(cursor, breakEnd);
    });
    if (endX - cursor > 1) parts.push(`M ${cursor} ${y} H ${endX}`);
    return parts.join(" ");
  };

  const edges = routedEdgeGroups.flatMap((group) => {
    const groupIndex = routedEdgeGroups.indexOf(group);
    const branchStart = Math.min(group.parentX, ...group.childXs);
    const branchEnd = Math.max(group.parentX, ...group.childXs);
    const trunkPath = `M ${group.parentX} ${group.parentY} V ${group.midY} ${horizontalPathWithBreaks(branchStart, branchEnd, group.midY, groupIndex)}`;
    const childPaths = group.childXs.map((childX) => `M ${childX} ${group.midY} V ${group.childY - 8}`);
    return [
      `<path class="edge-halo" d="${trunkPath}"></path>`,
      `<path class="edge" d="${trunkPath}"></path>`,
      ...childPaths.flatMap((path) => [
        `<path class="edge-halo" d="${path}"></path>`,
        `<path class="edge" marker-end="url(#arrow)" d="${path}"></path>`,
      ]),
    ];
  });

  const cards = state.data.people.map((person) => {
    const pos = layout.positions.get(person.id);
    if (!pos) return "";
    const visible = personMatches(person);
    const faded = queryActive && !visible ? "opacity:.22" : "";
    const highlight = queryActive && visible ? "highlight" : "";
    const status = lifeStatus(person);
    const order = childOrderText(person);
    return `
      <div class="person-card ${genderClass(person)} ${highlight}" data-person-id="${esc(person.id)}" role="button" tabindex="0" style="left:${pos.x}px;top:${pos.y}px;${faded}">
        ${photoHtml(person)}
        <span class="person-main">
          <span class="person-name">${genderIconHtml(person)}${esc(person.fullName)}</span>
          <span class="person-meta">${esc(formatDate(person.birthDate) || "Chưa có ngày sinh")}</span>
          <span class="person-meta">${esc([person.familyRole || "Chưa phân loại", order].filter(Boolean).join(" • "))}</span>
          <span class="status-line ${status.className}">${icon(status.icon)}${esc(status.label)}</span>
          ${(person.achievements || []).length ? `<span class="achievement-pill">${esc(person.achievements[0])}</span>` : ""}
        </span>
      </div>
    `;
  }).join("");

  return `
    <section class="tree-viewport" id="treeViewport">
      <div class="tree-canvas" id="treeCanvas" data-axis-x="${layout.axisX}" data-min-x="${layout.contentBounds.minX}" data-min-y="${layout.contentBounds.minY}" data-max-x="${layout.contentBounds.maxX}" data-max-y="${layout.contentBounds.maxY}" style="width:${layout.width}px;height:${layout.height}px;--card-w:${layout.cardW}px;--card-h:${layout.cardH}px;--photo-w:${layout.photoW}px;--photo-h:${layout.photoH}px">
        <svg class="tree-lines" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6d8179"></path>
            </marker>
          </defs>
          ${spouseLines.join("")}
          ${edges.join("")}
        </svg>
        ${cards}
      </div>
      <div class="pan-pad" aria-label="Điều hướng sơ đồ">
        <button class="icon-btn" data-pan="up" title="Lên" aria-label="Lên">${icon("up")}</button>
        <button class="icon-btn" data-pan="left" title="Trái" aria-label="Trái">${icon("left")}</button>
        <button class="icon-btn" data-pan="right" title="Phải" aria-label="Phải">${icon("right")}</button>
        <button class="icon-btn" data-pan="down" title="Xuống" aria-label="Xuống">${icon("down")}</button>
      </div>
    </section>
  `;
}

function filteredPeople() {
  const ranked = sortedPeopleByRank();
  return ranked.filter(personMatches);
}

function renderList() {
  const rows = filteredPeople().map((person) => {
    const spouses = (person.spouseIds || []).map((id) => personById(id)?.fullName).filter(Boolean).join(", ");
    const marriageYear = marriageYearFor(person);
    const status = lifeStatus(person);
    const order = childOrderText(person);
    return `
      <tr data-person-id="${esc(person.id)}">
        <td><strong class="table-name">${genderIconHtml(person)}${esc(person.fullName)}</strong><br><span class="person-meta">${esc(person.gender)}</span></td>
        <td>${esc(person.familyRole || "Khác")}</td>
        <td>${esc(order || "Chưa rõ")}</td>
        <td><span class="mini-badge ${status.className}">${icon(status.icon)}<span>${esc(status.label)}</span></span>${person.deathDate ? `<br><span class="person-meta">Mất: ${esc(formatDate(person.deathDate))}</span>` : ""}</td>
        <td>${esc(formatDate(person.birthDate))}</td>
        <td>${esc(marriageYear || "")}</td>
        <td>${parentSummary(person)}</td>
        <td>${esc(spouses || "Chưa có")}</td>
        <td>${esc(person.hometown || "")}</td>
        <td>${esc(personResidence(person))}</td>
        <td>${esc(person.job || "")}</td>
        <td>${esc(person.educationLevel || "")}</td>
        <td>${esc(academicRankFor(person))}</td>
        <td>${esc(academicDegreeFor(person))}</td>
        <td>${esc((person.achievements || []).join("; "))}</td>
      </tr>
    `;
  }).join("");
  return `
    <section class="list-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Họ tên</th><th>Vai trò</th><th>Thứ tự</th><th>Trạng thái</th><th>Ngày sinh</th><th>Năm lập gia đình</th><th>Bố mẹ / bên chồng</th><th>Vợ/chồng</th><th>Quê quán</th><th>Đang ở</th><th>Nghề nghiệp</th><th>Trình độ</th><th>Học hàm</th><th>Học vị</th><th>Thành tích</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="15">Không tìm thấy người phù hợp.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

const ACADEMIC_RANK_SCORE = { GS: 70000, PGS: 60000 };
const ACADEMIC_DEGREE_SCORE = { "Tiến sĩ": 50000, "Thạc sĩ": 40000, "Cử nhân": 30000 };
const EDUCATION_LEVEL_SCORE = { "Đại học": 2000, "Cao đẳng": 1000, "Phổ thông": 100 };

function academicDegreeFor(person) {
  if (person.academicDegree) return person.academicDegree;
  if (["Cử nhân", "Thạc sĩ", "Tiến sĩ"].includes(person.academicTitle)) return person.academicTitle;
  return ["Cao đẳng", "Đại học"].includes(person.educationLevel) ? "Cử nhân" : "";
}

function academicRankFor(person) {
  if (person.academicRank) return person.academicRank;
  return ["PGS", "GS"].includes(person.academicTitle) ? person.academicTitle : "";
}

function academicDisplay(person) {
  return [academicRankFor(person), academicDegreeFor(person)].filter(Boolean).join(" · ");
}

function isHonoree(person) {
  const degree = academicDegreeFor(person);
  return ["Cao đẳng", "Đại học"].includes(person.educationLevel)
    || ["Thạc sĩ", "Tiến sĩ"].includes(degree)
    || Boolean(academicRankFor(person));
}

function honorScore(person) {
  return (ACADEMIC_RANK_SCORE[academicRankFor(person)] || 0)
    + (ACADEMIC_DEGREE_SCORE[academicDegreeFor(person)] || 0)
    + (EDUCATION_LEVEL_SCORE[person.educationLevel] || 0)
    + Math.min((person.achievements || []).length, 20);
}

function honorFilterMatches(person) {
  if (state.honorFilter === "rank") return Boolean(academicRankFor(person));
  if (state.honorFilter === "degree") return Boolean(academicDegreeFor(person));
  if (state.honorFilter === "education") return ["Cao đẳng", "Đại học"].includes(person.educationLevel);
  if (state.honorFilter === "award") return (person.achievements || []).length > 0;
  return true;
}

function sortedHonorees() {
  return state.data.people
    .filter(isHonoree)
    .sort((a, b) => honorScore(b) - honorScore(a)
      || (b.achievements || []).length - (a.achievements || []).length
      || birthSortValue(a) - birthSortValue(b)
      || a.fullName.localeCompare(b.fullName, "vi"));
}

function honorSummaryLabel(person) {
  return academicDisplay(person) || person.educationLevel || "Thành tích tiêu biểu";
}

function renderHonorBoard() {
  const allHonorees = sortedHonorees();
  const honorees = allHonorees.filter(honorFilterMatches).filter(personMatches);
  const rankCount = allHonorees.filter((person) => academicRankFor(person)).length;
  const degreeCount = allHonorees.filter((person) => academicDegreeFor(person)).length;
  const awardCount = allHonorees.filter((person) => (person.achievements || []).length).length;

  return `
    <section class="honor-board">
      <header class="honor-banner">
        <div class="honor-emblem">${icon("award")}</div>
        <div class="honor-heading">
          <p>Nhánh họ Nguyễn Hữu · Kỳ Văn, Kỳ Anh, Hà Tĩnh</p>
          <h2>Bảng vàng hiếu học và thành tích</h2>
          <span>Trân trọng ghi nhận những người con đã nỗ lực học tập, lao động và đóng góp cho gia đình, quê hương.</span>
        </div>
        <div class="honor-stats" aria-label="Thống kê bảng vàng">
          <div><strong>${allHonorees.length}</strong><span>Người được ghi nhận</span></div>
          <div><strong>${rankCount}</strong><span>Có học hàm</span></div>
          <div><strong>${degreeCount}</strong><span>Có học vị</span></div>
          <div><strong>${awardCount}</strong><span>Có giải thưởng</span></div>
        </div>
      </header>

      <div class="honor-toolbar">
        <label class="searchbar honor-search">
          <span class="search-icon" title="Tìm kiếm">${icon("search")}</span>
          <input id="honorSearchInput" value="${esc(state.query)}" placeholder="Tìm theo tên, nghề nghiệp, trình độ, thành tích..." autocomplete="off">
        </label>
        <label class="honor-filter-label">
          <span>Nhóm vinh danh</span>
          <select id="honorFilter">
            <option value="all" ${state.honorFilter === "all" ? "selected" : ""}>Tất cả</option>
            <option value="rank" ${state.honorFilter === "rank" ? "selected" : ""}>Học hàm</option>
            <option value="degree" ${state.honorFilter === "degree" ? "selected" : ""}>Học vị</option>
            <option value="education" ${state.honorFilter === "education" ? "selected" : ""}>Cao đẳng, đại học</option>
            <option value="award" ${state.honorFilter === "award" ? "selected" : ""}>Giải thưởng, thành tích</option>
          </select>
        </label>
      </div>

      <div class="honor-grid">
        ${honorees.length ? honorees.map((person) => {
          const overallRank = allHonorees.findIndex((item) => item.id === person.id) + 1;
          const achievements = person.achievements || [];
          return `
            <article class="honor-card" data-person-id="${esc(person.id)}" role="button" tabindex="0">
              <div class="honor-card-top">
                <span class="honor-rank" title="Thứ tự theo cấp độ">${overallRank}</span>
                ${photoHtml(person, "honor-photo")}
                <div class="honor-identity">
                  <span class="honor-level">${esc(honorSummaryLabel(person))}</span>
                  <h3>${esc(person.fullName)}</h3>
                  <p>${esc(formatDate(person.birthDate) ? `Sinh ${formatDate(person.birthDate)}` : "Chưa cập nhật năm sinh")}</p>
                </div>
              </div>
              <dl class="honor-details">
                <div><dt>Trình độ</dt><dd>${esc(person.educationLevel || "Chưa cập nhật")}</dd></div>
                <div><dt>Học hàm</dt><dd>${esc(academicRankFor(person) || "Chưa cập nhật")}</dd></div>
                <div><dt>Học vị</dt><dd>${esc(academicDegreeFor(person) || "Chưa cập nhật")}</dd></div>
                <div><dt>Nghề nghiệp</dt><dd>${esc(person.job || "Chưa cập nhật")}</dd></div>
              </dl>
              ${achievements.length ? `<div class="honor-achievements"><strong>${icon("award")}Thành tích</strong>${achievements.slice(0, 3).map((item) => `<span>${esc(item)}</span>`).join("")}${achievements.length > 3 ? `<small>+${achievements.length - 3} thành tích khác</small>` : ""}</div>` : ""}
              ${person.notes ? `<p class="honor-note">${esc(person.notes)}</p>` : ""}
            </article>
          `;
        }).join("") : `
          <div class="honor-empty">
            ${icon("award")}
            <h3>Chưa có người phù hợp</h3>
            <p>Thông tin sẽ xuất hiện khi Admin cập nhật trình độ, học vị hoặc học hàm phù hợp.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function exportExcel() {
  const rows = sortedPeopleByRank();
  const headers = [
    "STT",
    "Họ tên",
    "Giới tính",
    "Vai trò",
    "Thứ tự",
    "Trạng thái",
    "Ngày sinh",
    "Ngày mất",
    "Năm lập gia đình",
    "Bố",
    "Mẹ",
    "Vợ/chồng",
    "Quê quán",
    "Đang ở",
    "Nghề nghiệp",
    "Trình độ",
    "Học hàm",
    "Học vị",
    "Thành tích",
  ];
  const cell = (value) => `<td>${esc(value)}</td>`;
  const body = rows.map((person, index) => {
    const status = lifeStatus(person);
    const spouses = (person.spouseIds || []).map((id) => personById(id)?.fullName).filter(Boolean).join(", ");
    return `<tr>${[
      index + 1,
      person.fullName,
      person.gender,
      person.familyRole,
      childOrderText(person),
      status.label,
      formatDate(person.birthDate),
      formatDate(person.deathDate),
      marriageYearFor(person),
      personById(person.fatherId)?.fullName || "",
      personById(person.motherId)?.fullName || "",
      spouses,
      person.hometown,
      personResidence(person),
      person.job,
      person.educationLevel,
      academicRankFor(person),
      academicDegreeFor(person),
      (person.achievements || []).join("; "),
    ].map(cell).join("")}</tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map((item) => `<th>${esc(item)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gia-pha-nguyen-huu.xls";
  link.click();
  URL.revokeObjectURL(url);
}

function renderDetail(id) {
  const person = personById(id);
  if (!person) return "";
  const father = personById(person.fatherId);
  const mother = personById(person.motherId);
  const spouses = (person.spouseIds || []).map(personById).filter(Boolean);
  const children = childrenForParent(id);
  const status = lifeStatus(person);
  const order = childOrderText(person);
  const marriageYear = marriageYearFor(person);
  const { husband, fatherInLaw, motherInLaw } = inLawParents(person);
  const isDaughterInLaw = person.familyRole === "Con dâu";
  const isDaughter = person.familyRole === "Con gái";
  const galleryPhotos = cleanGallery(person.galleryPhotos);
  const viewerIdentity = personById(state.viewerUser?.personId);
  const personalSpeech = viewerIdentity && viewerIdentity.id !== person.id ? kinshipSpeech(viewerIdentity, person) : null;
  const hasGraveInfo = status.label === "Đã mất" && [person.graveLocation, person.graveAddress, person.graveMapUrl, person.graveNotes, person.gravePhoto].some(Boolean);
  const graveMapUrl = /^https?:\/\//i.test(String(person.graveMapUrl || "").trim()) ? String(person.graveMapUrl).trim() : "";
  return `
    <aside class="detail-drawer">
      <div class="drawer-head">
        <div>
          <h2>${esc(person.fullName)}</h2>
          <p class="notice">${esc([person.familyRole, order, status.label].filter(Boolean).join(" • ") || "Thông tin cá nhân")}</p>
        </div>
        <button class="ghost-btn" id="closeDetail">Đóng</button>
      </div>
      <div class="drawer-body">
        <div class="profile-hero">
          ${photoHtml(person)}
          <div>
            <div class="chips">
              <span class="chip icon-chip">${genderIconHtml(person)}${esc(person.gender || "Khác")}</span>
              <span class="chip icon-chip ${status.className}">${icon(status.icon)}${esc(status.label)}</span>
              ${viewerIdentity ? `<span class="chip personal-call-chip">${viewerIdentity.id === person.id ? "Hồ sơ của bạn" : `Bạn gọi: ${esc(personalSpeech.call)}`}</span>` : ""}
              ${status.label === "Đã mất" && (person.graveLocation || person.graveAddress) ? `<span class="chip grave-location-chip">Phần mộ: ${esc(person.graveLocation || person.graveAddress)}</span>` : ""}
              ${order ? `<span class="chip icon-chip">${icon("order")}${esc(order)}</span>` : ""}
              ${person.birthDate ? `<span class="chip">Sinh ${esc(formatDate(person.birthDate))}</span>` : ""}
              ${person.deathDate ? `<span class="chip">Mất ${esc(formatDate(person.deathDate))}</span>` : ""}
              ${marriageYear ? `<span class="chip">Lập gia đình ${esc(marriageYear)}</span>` : ""}
            </div>
          </div>
        </div>
        <dl class="info-grid">
          ${isDaughterInLaw ? `
          <dt>Chồng</dt><dd>${husband ? linkPerson(husband) : "Chưa chọn chồng"}</dd>
          <dt>Bố đẻ</dt><dd>${esc(person.daughterInLawFather || "Chưa cập nhật")}</dd>
          <dt>Mẹ đẻ</dt><dd>${esc(person.daughterInLawMother || "Chưa cập nhật")}</dd>
          <dt>Bố chồng</dt><dd>${fatherInLaw ? linkPerson(fatherInLaw) : "Chưa cập nhật"}</dd>
          <dt>Mẹ chồng</dt><dd>${motherInLaw ? linkPerson(motherInLaw) : "Chưa cập nhật"}</dd>
          ` : `
          <dt>Bố đẻ</dt><dd>${father ? linkPerson(father) : "Chưa cập nhật"}</dd>
          <dt>Mẹ đẻ</dt><dd>${mother ? linkPerson(mother) : "Chưa cập nhật"}</dd>
          ${isDaughter ? "" : `<dt>Vợ/chồng</dt><dd>${spouses.length ? spouses.map(linkPerson).join(", ") : "Chưa cập nhật"}</dd>`}
          `}
          ${isDaughter ? "" : `<dt>Con</dt><dd>${children.length ? children.map(linkPerson).join(", ") : "Chưa cập nhật"}</dd>`}
          <dt>Năm lập gia đình</dt><dd>${esc(marriageYear || "Chưa cập nhật")}</dd>
          ${isDaughter ? `
          <dt>Họ tên chồng</dt><dd>${esc(person.daughterHusbandName || "Chưa cập nhật")}</dd>
          <dt>Lấy chồng về đâu</dt><dd>${esc(person.daughterMarriedAddress || "Chưa cập nhật")}</dd>
          <dt>Mấy người con</dt><dd>${esc(person.daughterChildrenCount || "Chưa cập nhật")}</dd>
          ` : ""}
          <dt>Vai trò</dt><dd>${esc(person.familyRole || "Khác")}</dd>
          <dt>Thứ tự</dt><dd>${esc(order || "Chưa rõ do thiếu thông tin bố/mẹ hoặc ngày sinh")}</dd>
          <dt>Trạng thái</dt><dd>${badgeHtml(status)}</dd>
          <dt>Quê quán</dt><dd>${esc(person.hometown || "Chưa cập nhật")}</dd>
          <dt>Đang ở</dt><dd>${esc(personResidence(person) || "Chưa cập nhật")}</dd>
          <dt>Nghề nghiệp</dt><dd>${esc(person.job || "Chưa cập nhật")}</dd>
          <dt>Trình độ</dt><dd>${esc(person.educationLevel || "Chưa cập nhật")}</dd>
          <dt>Học hàm</dt><dd>${esc(academicRankFor(person) || "Chưa cập nhật")}</dd>
          <dt>Học vị</dt><dd>${esc(academicDegreeFor(person) || "Chưa cập nhật")}</dd>
          <dt>Thành tích</dt><dd>${(person.achievements || []).length ? `<div class="chips">${person.achievements.map((item) => `<span class="chip">${esc(item)}</span>`).join("")}</div>` : "Chưa cập nhật"}</dd>
          <dt>Ghi chú</dt><dd>${esc(person.notes || "Không có")}</dd>
        </dl>
        ${hasGraveInfo ? `
          <section class="grave-section">
            <h3>${icon("mapPin")} Thông tin phần mộ</h3>
            ${person.gravePhoto ? `<button class="grave-photo gallery-photo" data-photo-url="${esc(assetUrl(person.gravePhoto))}" data-photo-title="${esc(`Phần mộ ${person.fullName}`)}" type="button"><img src="${esc(assetUrl(person.gravePhoto))}" alt="${esc(`Phần mộ ${person.fullName}`)}" loading="lazy"></button>` : ""}
            <dl class="info-grid">
              ${person.graveLocation ? `<dt>Khu/mộ phần</dt><dd>${esc(person.graveLocation)}</dd>` : ""}
              ${person.graveAddress ? `<dt>Địa chỉ</dt><dd>${esc(person.graveAddress)}</dd>` : ""}
              ${graveMapUrl ? `<dt>Bản đồ</dt><dd><a class="text-link" href="${esc(graveMapUrl)}" target="_blank" rel="noopener noreferrer">Mở vị trí phần mộ</a></dd>` : ""}
              ${person.graveNotes ? `<dt>Ghi chú</dt><dd>${esc(person.graveNotes)}</dd>` : ""}
            </dl>
          </section>
        ` : ""}
        ${galleryPhotos.length ? `
          <section class="gallery-section">
            <h3>Ảnh khác</h3>
            <div class="gallery-grid">
              ${galleryPhotos.map((url, index) => `
                <button class="gallery-photo" data-photo-url="${esc(assetUrl(url))}" data-photo-title="${esc(`${person.fullName} - ảnh ${index + 1}`)}" type="button">
                  <img src="${esc(assetUrl(url))}" alt="${esc(`${person.fullName} ảnh ${index + 1}`)}" loading="lazy" decoding="async">
                </button>
              `).join("")}
            </div>
          </section>
        ` : ""}
      </div>
    </aside>
  `;
}

function linkPerson(person) {
  return `<button class="text-btn inline-person" data-person-id="${esc(person.id)}">${esc(person.fullName)}</button>`;
}

function renderPhotoViewer() {
  const person = personById(state.photoPersonId);
  const url = state.photoUrl || person?.photo || "";
  const title = state.photoTitle || person?.fullName || "Ảnh";
  if (!url) return "";
  return `
    <div class="photo-viewer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <button class="photo-viewer-backdrop" id="closePhotoViewer" type="button" aria-label="Đóng ảnh"></button>
      <div class="photo-viewer-panel">
        <div class="photo-viewer-head">
          <strong>${esc(title)}</strong>
          <button class="ghost-btn" id="closePhotoViewerBtn" type="button">Đóng</button>
        </div>
        <img src="${esc(assetUrl(url))}" alt="${esc(title)}">
      </div>
    </div>
  `;
}

function cleanGallery(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function bindPublic() {
  bindSearchableSelects();
  const openKinshipLookup = () => {
    const people = sortedPeopleByRank();
    state.kinshipPersonAId = state.kinshipPersonAId || people[0]?.id || "";
    state.kinshipPersonBId = state.kinshipPersonBId || people[1]?.id || "";
    state.kinshipOpen = true;
    state.menuOpen = false;
    renderPublic();
  };
  $("#menuToggle")?.addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    renderPublic();
  });
  $("#viewSwitchFloatBtn")?.addEventListener("click", () => {
    state.view = state.view === "honor" ? "tree" : "honor";
    state.menuOpen = false;
    if (state.view === "tree") state.hasAutoFitTree = false;
    renderPublic();
  });
  $("#kinshipFloatBtn")?.addEventListener("click", openKinshipLookup);
  $("#viewerLogoutBtn")?.addEventListener("click", logoutViewer);
  $("#searchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.menuOpen = true;
    renderPublic();
    const input = $("#searchInput");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  $("#searchInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const firstSuggestion = $(".viewer-suggestion");
    if (!firstSuggestion) return;
    event.preventDefault();
    state.selectedId = firstSuggestion.dataset.personId;
    state.menuOpen = false;
    renderPublic();
  });
  $("#honorSearchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderPublic();
    const input = $("#honorSearchInput");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  $("#honorFilter")?.addEventListener("change", (event) => {
    state.honorFilter = event.target.value;
    renderPublic();
  });
  $$(".viewer-suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.personId;
      state.menuOpen = false;
      renderPublic();
    });
  });
  $("#kinshipOpenBtn")?.addEventListener("click", openKinshipLookup);
  $("#exportExcelBtn")?.addEventListener("click", () => {
    exportExcel();
    state.menuOpen = true;
  });
  $("#closeKinshipBtn")?.addEventListener("click", () => {
    state.kinshipOpen = false;
    renderPublic();
  });
  $("#closeKinshipBackdrop")?.addEventListener("click", () => {
    state.kinshipOpen = false;
    renderPublic();
  });
  $("#kinshipPersonA")?.addEventListener("change", (event) => {
    state.kinshipPersonAId = event.target.value;
    renderPublic();
  });
  $("#kinshipPersonB")?.addEventListener("change", (event) => {
    state.kinshipPersonBId = event.target.value;
    renderPublic();
  });
  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.menuOpen = false;
      if (state.view === "tree") state.hasAutoFitTree = false;
      renderPublic();
    });
  });
  $$(".zoom-controls button").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.zoom;
      if (action === "in") state.scale = Math.min(1.8, state.scale + 0.12);
      if (action === "out") state.scale = Math.max(0.28, state.scale - 0.12);
      if (action === "fit") fitTreeToViewport();
      state.menuOpen = true;
      applyTransform();
    });
  });
  $$(".pan-pad button").forEach((button) => {
    button.addEventListener("click", () => nudgePan(button.dataset.pan));
  });
  $$(".person-card, .honor-card, tbody tr, .inline-person").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedId = item.dataset.personId;
      state.menuOpen = false;
      renderPublic();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      state.selectedId = item.dataset.personId;
      renderPublic();
    });
  });
  $$(".photo-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.photoPersonId = button.dataset.photoPersonId;
      state.photoUrl = "";
      state.photoTitle = "";
      state.menuOpen = false;
      renderPublic();
    });
  });
  $$(".gallery-photo").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.photoPersonId = "";
      state.photoUrl = button.dataset.photoUrl;
      state.photoTitle = button.dataset.photoTitle;
      state.menuOpen = false;
      renderPublic();
    });
  });
  $("#closeDetail")?.addEventListener("click", () => {
    state.selectedId = "";
    renderPublic();
  });
  $("#closePhotoViewer")?.addEventListener("click", closePhotoViewer);
  $("#closePhotoViewerBtn")?.addEventListener("click", closePhotoViewer);
  bindPan();
  if (!state.hasAutoFitTree && state.view === "tree") {
    state.hasAutoFitTree = true;
    fitTreeToViewport();
    applyTransform();
  }
}

async function handleViewerAuth(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Đang đăng nhập...";
  }
  const form = new FormData(formElement);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "").trim();
  try {
    if (state.staticMode) {
      const accounts = JSON.parse(localStorage.getItem("family_viewer_accounts") || "{}");
      if (!accounts[username] || accounts[username].password !== password) {
        throw new Error("Sai tài khoản hoặc mật khẩu.");
      }
      state.viewerUser = { username, displayName: accounts[username]?.displayName || username };
      localStorage.setItem("family_viewer_user", JSON.stringify(state.viewerUser));
    } else {
      const result = await api("/api/view-login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      state.viewerUser = result.user || { username };
    }
    state.viewerAuthenticated = true;
    state.viewerSessionError = "";
    await loadData();
    renderPublic();
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Đăng nhập";
    }
  }
}

async function logoutViewer() {
  try {
    if (!state.staticMode) await api("/api/view-logout", { method: "POST", body: "{}" });
  } catch (error) {
    // Logging out should still clear the local UI even if the request fails.
  }
  localStorage.removeItem("family_viewer_user");
  state.viewerAuthenticated = false;
  state.viewerUser = null;
  state.data = { familyName: state.data.familyName, people: [] };
  renderViewerAuth();
}

function closePhotoViewer() {
  state.photoPersonId = "";
  state.photoUrl = "";
  state.photoTitle = "";
  renderPublic();
}

function bindPan() {
  const viewport = $("#treeViewport");
  if (!viewport) return;
  let dragging = false;
  let start = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".person-card")) return;
    dragging = true;
    start = { x: event.clientX, y: event.clientY, panX: state.pan.x, panY: state.pan.y };
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    state.pan.x = start.panX + event.clientX - start.x;
    state.pan.y = start.panY + event.clientY - start.y;
    applyTransform();
  });
  viewport.addEventListener("pointerup", () => {
    dragging = false;
    viewport.classList.remove("dragging");
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.scale = Math.min(1.8, Math.max(0.28, state.scale + (event.deltaY > 0 ? -0.06 : 0.06)));
    applyTransform();
  }, { passive: false });
  viewport.addEventListener("touchstart", handleTouchStart, { passive: false });
  viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
  viewport.addEventListener("touchend", () => {
    state.touch = null;
  }, { passive: true });
}

function fitTreeToViewport() {
  const viewport = $("#treeViewport");
  const canvas = $("#treeCanvas");
  if (!viewport || !canvas) return;
  const minX = Number(canvas.dataset.minX || 0);
  const minY = Number(canvas.dataset.minY || 0);
  const maxX = Number(canvas.dataset.maxX || canvas.offsetWidth || 1);
  const maxY = Number(canvas.dataset.maxY || canvas.offsetHeight || 1);
  const axisX = Number(canvas.dataset.axisX || (minX + maxX) / 2);
  const contentW = Math.max(1, Math.max(axisX - minX, maxX - axisX) * 2);
  const contentH = Math.max(1, maxY - minY);
  const padX = Math.min(140, Math.max(36, viewport.clientWidth * 0.08));
  const padY = Math.min(110, Math.max(28, viewport.clientHeight * 0.08));
  const fitScale = Math.min(
    1.05,
    Math.max(0.22, Math.min((viewport.clientWidth - padX * 2) / contentW, (viewport.clientHeight - padY * 2) / contentH)),
  );
  state.scale = fitScale;
  state.pan = {
    x: viewport.clientWidth / 2 - axisX * fitScale,
    y: viewport.clientHeight / 2 - ((minY + maxY) / 2) * fitScale,
  };
}

function applyTransform() {
  const canvas = $("#treeCanvas");
  if (canvas) canvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
}

function nudgePan(direction) {
  const amount = 170;
  if (direction === "left") state.pan.x += amount;
  if (direction === "right") state.pan.x -= amount;
  if (direction === "up") state.pan.y += amount;
  if (direction === "down") state.pan.y -= amount;
  applyTransform();
}

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function handleTouchStart(event) {
  if (event.target.closest(".person-card")) return;
  if (event.touches.length === 1) {
    event.preventDefault();
    state.touch = {
      mode: "pan",
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      panX: state.pan.x,
      panY: state.pan.y,
    };
  } else if (event.touches.length === 2) {
    event.preventDefault();
    state.touch = {
      mode: "pinch",
      distance: touchDistance(event.touches),
      center: touchCenter(event.touches),
      panX: state.pan.x,
      panY: state.pan.y,
      scale: state.scale,
    };
  }
}

function handleTouchMove(event) {
  if (!state.touch) return;
  if (state.touch.mode === "pan" && event.touches.length === 1) {
    event.preventDefault();
    state.pan.x = state.touch.panX + event.touches[0].clientX - state.touch.x;
    state.pan.y = state.touch.panY + event.touches[0].clientY - state.touch.y;
    applyTransform();
  } else if (state.touch.mode === "pinch" && event.touches.length === 2) {
    event.preventDefault();
    const center = touchCenter(event.touches);
    state.scale = Math.min(1.8, Math.max(0.28, state.touch.scale * (touchDistance(event.touches) / state.touch.distance)));
    state.pan.x = state.touch.panX + center.x - state.touch.center.x;
    state.pan.y = state.touch.panY + center.y - state.touch.center.y;
    applyTransform();
  }
}

async function renderAdmin() {
  const me = await api("/api/me").catch(() => ({ authenticated: false }));
  state.authenticated = me.authenticated;
  state.currentAdmin = me.user || null;
  if (!state.authenticated) {
    app.innerHTML = `
      <div class="app-shell">
        ${topbar(true)}
        <main class="login-screen">
          <form class="login-panel" id="loginForm">
            <h2>Đăng nhập khu cập nhật</h2>
            <div class="field"><label>Tài khoản</label><input name="username" autocomplete="username" required></div>
            <div class="field"><label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required></div>
            <div class="form-actions"><button class="btn" type="submit">Đăng nhập</button></div>
          </form>
          <div id="toastRoot"></div>
        </main>
      </div>
    `;
    $("#loginForm").addEventListener("submit", login);
    return;
  }
  await loadData();
  const editableIds = editablePersonIdsForCurrentUser();
  if (!adminCanEditAll() && !editableIds.has(state.editingId)) state.editingId = [...editableIds][0] || "";
  await Promise.all([
    adminCanManageAccounts() ? loadViewerAccounts() : Promise.resolve(),
    adminCanEditAll() ? loadStorageStats() : Promise.resolve(),
    loadChangeRequests(),
  ]);
  renderAdminPanel();
}

function adminSearchText(person) {
  return [
    person.fullName,
    person.familyRole,
    person.gender,
    person.birthDate,
    person.deathDate,
    person.marriageYear,
    person.job,
    person.educationLevel,
    academicRankFor(person),
    academicDegreeFor(person),
    person.address,
    person.hometown,
    person.currentResidence,
    person.daughterInLawFather,
    person.daughterInLawMother,
    person.daughterHusbandName,
    person.daughterMarriedAddress,
    person.daughterChildrenCount,
    person.graveLocation,
    person.graveAddress,
    person.graveNotes,
    person.notes,
    ...(person.achievements || []),
  ].join(" ");
}

function adminSearchScore(person, query) {
  const normalizedQuery = normalizeText(query).trim();
  if (!normalizedQuery) return 1;
  const text = normalizeText(adminSearchText(person));
  const name = normalizeText(person.fullName);
  const compactQuery = compactText(normalizedQuery);
  const compactName = compactText(person.fullName);
  const textWords = text.split(/[^a-z0-9]+/).filter(Boolean);
  const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
  const queryWords = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);

  if (name === normalizedQuery) return 200;
  if (name.includes(normalizedQuery)) return 180;
  if (text.includes(normalizedQuery)) return 150;
  if (compactQuery && compactName.includes(compactQuery)) return 135;
  if (queryWords.length && queryWords.every((word) => textWords.some((textWord) => textWord.includes(word)))) return 115;
  if (queryWords.length && queryWords.every((word, index) => nameWords[index]?.startsWith(word) || nameWords.some((nameWord) => nameWord.startsWith(word)))) return 105;
  if (compactQuery && isSubsequence(compactQuery, compactName)) return 85;
  if (queryWords.length && queryWords.every((word) => textWords.some((textWord) => smallEditDistance(word, textWord.slice(0, Math.max(word.length, 1))) <= 1))) return 72;
  if (compactQuery.length >= 2 && textWords.some((word) => smallEditDistance(compactQuery, word) <= 2)) return 58;
  return 0;
}

function accountIdentitySelect(selectedId = "", disabled = false) {
  const options = state.data.people
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"))
    .map((person) => `<option value="${esc(person.id)}" ${person.id === selectedId ? "selected" : ""}>${esc(person.fullName)}${person.birthDate ? ` · ${esc(formatDate(person.birthDate))}` : ""}</option>`)
    .join("");
  return searchableSelect(`<select name="personId" ${disabled ? "disabled" : ""} aria-label="Danh tính trong gia phả"><option value="">Chưa gắn danh tính</option>${options}</select>`, "Tìm danh tính...");
}

function accountRoleOptions(selected) {
  return [
    ["viewer", "Người xem"],
    ["member", "Thành viên"],
    ["clan_head", "Trưởng họ"],
    ["admin", "Admin"],
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function renderAccountManagement() {
  if (!adminCanManageAccounts()) return "";
  return `
    <div class="viewer-account-box">
      <h3>Tài khoản và phân quyền</h3>
      <p class="notice">Gắn đúng danh tính để web tự tính cách xưng hô và giới hạn quyền sửa.</p>
      <form id="viewerAccountForm" class="viewer-account-form">
        <input name="displayName" placeholder="Tên hiển thị">
        <input name="username" placeholder="Tài khoản" autocomplete="off" required>
        <input name="password" type="password" placeholder="Mật khẩu" autocomplete="new-password" required>
        <select name="role" aria-label="Loại tài khoản">${accountRoleOptions("viewer")}</select>
        ${accountIdentitySelect()}
        <button class="btn" type="submit">Tạo tài khoản</button>
      </form>
      <div class="viewer-account-list">
        ${state.viewerAccounts.length ? state.viewerAccounts.map((user) => {
          const rootIdentityEditable = user.isRoot && state.currentAdmin?.isRoot;
          const locked = user.locked;
          return `
            <form class="viewer-account-row account-edit-form" data-username="${esc(user.username)}">
              <span class="account-main"><strong>${esc(user.displayName || user.username)}</strong><small>${esc(user.username)} · ${roleLabel(user.role, user.isRoot)}${user.personId ? ` · ${esc(personById(user.personId)?.fullName || "Danh tính không còn tồn tại")}` : " · chưa gắn danh tính"}</small></span>
              <input name="displayName" value="${esc(user.displayName || "")}" ${locked ? "disabled" : ""} placeholder="Tên hiển thị">
              <select name="role" ${locked ? "disabled" : ""} aria-label="Loại tài khoản">${accountRoleOptions(user.role)}</select>
              ${accountIdentitySelect(user.personId, locked && !rootIdentityEditable)}
              <input name="password" type="password" ${locked ? "disabled" : ""} placeholder="Mật khẩu mới">
              <div class="account-actions">
                ${locked && !rootIdentityEditable ? `<span class="account-lock">Không thể sửa/xóa</span>` : `<button class="text-btn update-account" type="submit">${locked ? "Lưu danh tính" : "Lưu"}</button>`}
                ${locked ? "" : `<button class="text-btn delete-viewer-user" data-username="${esc(user.username)}" type="button">Xóa</button>`}
              </div>
            </form>`;
        }).join("") : `<p class="notice">Chưa có tài khoản nào.</p>`}
      </div>
    </div>`;
}

function changeStatusLabel(status) {
  return ({ pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Đã từ chối" })[status] || status;
}

function changeFieldLabel(field) {
  return ({
    fullName: "Họ tên", gender: "Giới tính", birthDate: "Ngày sinh", deathDate: "Ngày mất",
    marriageYear: "Năm lập gia đình", familyRole: "Vai trò", hometown: "Quê quán",
    currentResidence: "Nơi ở", address: "Địa chỉ", job: "Nghề nghiệp", educationLevel: "Trình độ",
    academicDegree: "Học vị", academicRank: "Học hàm", achievements: "Thành tích", photo: "Ảnh cá nhân",
    galleryPhotos: "Ảnh khác", graveLocation: "Khu/mộ phần", graveAddress: "Địa chỉ phần mộ",
    graveMapUrl: "Bản đồ phần mộ", graveNotes: "Ghi chú phần mộ", gravePhoto: "Ảnh phần mộ", notes: "Ghi chú",
  })[field] || field;
}

function changeValueText(value) {
  if (Array.isArray(value)) return value.join("; ") || "Để trống";
  const text = String(value ?? "").trim();
  if (!text) return "Để trống";
  if (/^\/api\/photos\//.test(text) || /^https?:\/\//i.test(text)) return "Đã cập nhật đường dẫn/ảnh";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function renderChangeRequests() {
  const requests = state.changeRequests || [];
  const pendingCount = requests.filter((item) => item.status === "pending").length;
  return `
    <section class="change-requests-box">
      <div class="change-requests-head"><h3>${adminCanManageAccounts() ? "Yêu cầu chờ duyệt" : "Lịch sử đề nghị cập nhật"}</h3><span>${pendingCount} đang chờ</span></div>
      ${requests.length ? `<div class="change-request-list">${requests.map((item) => `
        <article class="change-request ${esc(item.status)}">
          <div><strong>${esc(item.personName)}</strong><span>${esc(item.displayName)} · ${item.action === "create" ? "Thêm người" : "Sửa thông tin"} · ${changeStatusLabel(item.status)}</span></div>
          ${item.changes ? `<dl class="change-preview">${Object.entries(item.changes).map(([field, value]) => `<dt>${esc(changeFieldLabel(field))}</dt><dd>${esc(changeValueText(value))}</dd>`).join("")}</dl>` : item.person ? `<p>Người mới: ${esc(item.person.fullName || "Chưa có tên")} · ${esc(item.person.birthDate || "chưa có ngày sinh")}</p>` : ""}
          ${item.reviewNote ? `<p>${esc(item.reviewNote)}</p>` : ""}
          ${adminCanManageAccounts() && item.status === "pending" ? `<div class="request-actions"><button class="btn approve-request" data-request-id="${esc(item.id)}" type="button">Duyệt</button><button class="ghost-btn reject-request" data-request-id="${esc(item.id)}" type="button">Từ chối</button></div>` : ""}
        </article>`).join("")}</div>` : `<p class="notice">Chưa có yêu cầu cập nhật.</p>`}
    </section>`;
}

function renderAdminPanel() {
  const adminQuery = state.adminQuery.trim();
  const editableIds = editablePersonIdsForCurrentUser();
  const availablePeople = adminCanEditAll() ? state.data.people : state.data.people.filter((person) => editableIds.has(person.id));
  const scoredPeople = availablePeople
    .map((person) => ({ person, score: adminSearchScore(person, adminQuery) }))
    .filter((item) => !adminQuery || item.score > 0)
    .sort((a, b) => (adminQuery ? b.score - a.score : 0) || a.person.fullName.localeCompare(b.person.fullName, "vi"));
  const people = scoredPeople.map((item) => item.person);
  const suggestions = adminQuery ? scoredPeople.slice(0, 7).map((item) => item.person) : [];
  const editing = (editableIds.has(state.editingId) ? personById(state.editingId) : null) || { ...emptyPerson };
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(true)}
      <main class="workspace">
        <section class="admin-layout">
          <aside class="admin-panel admin-sidebar">
            <div class="panel-head">
              <h2>${adminCanEditAll() ? `Danh sách ${state.data.people.length} người` : `Gia đình được phép cập nhật · ${availablePeople.length} người`}</h2>
              <label class="searchbar"><span class="search-icon" title="Tìm kiếm">${icon("search")}</span><input id="adminSearch" value="${esc(state.adminQuery)}" placeholder="Tìm người để sửa" autocomplete="off"></label>
              ${suggestions.length ? `
                <div class="admin-suggestions" aria-label="Gợi ý tìm kiếm">
                  ${suggestions.map((person) => `
                    <button class="admin-suggestion" type="button" data-edit-id="${esc(person.id)}">
                      <strong>${esc(person.fullName)}</strong>
                      <span>${esc([person.familyRole, formatDate(person.birthDate), personResidence(person)].filter(Boolean).join(" · ") || "Chưa cập nhật")}</span>
                    </button>
                  `).join("")}
                </div>
              ` : adminQuery ? `<p class="notice admin-search-empty">Không thấy tên phù hợp. Hãy thử gỡ dấu hoặc nhập ít chữ hơn.</p>` : ""}
              <div class="import-actions">
                ${state.currentAdmin?.personId || adminCanEditAll() ? `<button class="btn" id="newPersonBtn">Thêm người</button>` : ""}
                ${adminCanEditAll() ? `
                  <button class="ghost-btn" id="exportBtn">Xuất JSON</button>
                  <label class="ghost-btn">Nhập JSON<input id="importJson" type="file" accept=".json,application/json" hidden></label>
                  <label class="ghost-btn">Nhập CSV<input id="importCsv" type="file" accept=".csv,text/csv" hidden></label>
                ` : ""}
              </div>
              ${adminCanEditAll() ? storageSummary() : `<p class="permission-note">${state.currentAdmin?.personId ? "Thông tin bạn gửi sẽ được Admin duyệt trước khi hiển thị." : "Tài khoản chưa được gắn danh tính. Hãy liên hệ Admin để cấp quyền cập nhật."}</p>`}
            </div>
            <div class="person-list">
              ${people.length ? people.map((person) => `
                <button class="admin-person-row ${person.id === state.editingId ? "active" : ""}" data-edit-id="${esc(person.id)}">
                  ${person.photo ? `<img class="mini-avatar" src="${esc(assetUrl(person.photo))}" alt="" loading="lazy" decoding="async">` : `<span class="mini-avatar avatar-fallback">${esc(initials(person.fullName))}</span>`}
                  <span><strong>${esc(person.fullName)}</strong><br><span class="person-meta">${esc(person.familyRole || person.job || personResidence(person) || "Chưa cập nhật")}</span></span>
                </button>
              `).join("") : `<p class="notice empty-admin-search">Không có kết quả phù hợp.</p>`}
            </div>
            ${renderAccountManagement()}
            ${renderChangeRequests()}
          </aside>
          <section class="admin-panel">
            <form class="form-wrap" id="personForm">
              <h2>${editing.id ? "Sửa thông tin" : "Thêm người mới"}</h2>
              <p class="notice">${adminCanEditAll() ? "Chọn bố, mẹ và vợ/chồng bằng danh sách bên dưới. Quan hệ vợ/chồng sẽ tự đồng bộ hai chiều." : "Bạn chỉ được cập nhật hồ sơ của mình, vợ/chồng và các con. Thay đổi chỉ công khai sau khi Admin duyệt."}</p>
              ${personForm(editing)}
              <div class="form-actions">
                <button class="btn" type="submit">${adminCanEditAll() ? "Lưu thông tin" : "Gửi Admin duyệt"}</button>
                ${editing.id && adminCanEditAll() ? `<button class="danger-btn" type="button" id="deleteBtn">Xóa người này</button>` : ""}
              </div>
            </form>
          </section>
        </section>
        <div id="toastRoot"></div>
      </main>
    </div>
  `;
  bindAdmin();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = index >= 2 ? 2 : 0;
  return `${size.toFixed(digits)} ${units[index]}`;
}

function storageSummary() {
  const stats = state.storageStats;
  if (!stats) {
    return `
      <div class="storage-box">
        <div class="storage-head"><strong>Dung lượng</strong><span>Đang tải</span></div>
        <div class="storage-bar"><span style="width: 0%"></span></div>
      </div>
    `;
  }
  const percent = Math.max(0, Math.min(100, Number(stats.usedPercent || 0)));
  const parts = stats.parts || {};
  return `
    <div class="storage-box">
      <div class="storage-head">
        <strong>Dung lượng web</strong>
        <span>${percent.toFixed(percent < 1 ? 3 : 1)}%</span>
      </div>
      <div class="storage-bar"><span style="width: ${percent}%"></span></div>
      <div class="storage-lines">
        <span>Đã dùng: <strong>${formatBytes(stats.usedBytes)}</strong></span>
        <span>Còn miễn phí: <strong>${formatBytes(stats.remainingFreeBytes)}</strong> / ${formatBytes(stats.freeQuotaBytes)}</span>
        <span>Ảnh: ${formatBytes(parts.photoBytes)} · ${parts.photoCount || 0} ảnh</span>
        <span>Dữ liệu: ${formatBytes(parts.familyBytes)} · ${parts.peopleCount || 0} người</span>
      </div>
      <p class="storage-note">Cloudflare D1 miễn phí 5 GB. R2 lưu ảnh miễn phí 10 GB-tháng nếu sau này chuyển ảnh sang R2.</p>
    </div>
  `;
}

function personForm(person) {
  const isDaughterInLaw = person.familyRole === "Con dâu";
  const isDaughter = person.familyRole === "Con gái";
  const husband = spouseForInLaw(person);
  const spouseId = (person.spouseIds || [])[0] || "";
  const galleryPhotos = cleanGallery(person.galleryPhotos);
  const relationshipDisabled = !adminCanEditAll() && !!person.id;
  const identity = personById(state.currentAdmin?.personId);
  const memberParentIds = new Set([identity?.id, ...(identity?.spouseIds || [])].filter(Boolean));
  const parentPredicate = adminCanEditAll() || person.id ? (() => true) : ((item) => memberParentIds.has(item.id));
  return `
    <div class="form-grid">
      <div class="field full"><label>Họ và tên</label><input name="fullName" value="${esc(person.fullName)}" required></div>
      <div class="field"><label>Giới tính</label><select name="gender">
        ${["Nam", "Nữ", "Khác"].map((item) => `<option ${person.gender === item ? "selected" : ""}>${item}</option>`).join("")}
      </select></div>
      <div class="field"><label>Vai trò trong dòng họ</label><select name="familyRole">
        ${["Con trai", "Con gái", "Con dâu", "Khác"].map((item) => `<option ${person.familyRole === item ? "selected" : ""}>${item}</option>`).join("")}
      </select></div>
      <div class="field"><label>Ngày/năm sinh</label><input name="birthDate" value="${esc(person.birthDate)}" placeholder="Ví dụ: 1973, 01/1973 hoặc 01/01/1973"></div>
      <div class="field"><label>Ngày/năm mất nếu có</label><input name="deathDate" value="${esc(person.deathDate)}" placeholder="Ví dụ: 2015, 05/2015 hoặc 08/05/2015"></div>
      <div class="field"><label>Năm lập gia đình</label><input name="marriageYear" value="${esc(person.marriageYear || "")}" placeholder="Ví dụ: 1992"></div>
      <div class="field"><label>Quê quán</label><input name="hometown" value="${esc(person.hometown || person.address || "")}" placeholder="Ví dụ: Sa Xá - Kỳ Văn - Hà Tĩnh"></div>
      <div class="field"><label>Đang ở hiện nay</label><input name="currentResidence" value="${esc(person.currentResidence || person.address || "")}" placeholder="Nơi ở hiện nay"></div>
      <div class="field ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Bố đẻ của con dâu</label><input name="daughterInLawFather" value="${esc(person.daughterInLawFather)}" placeholder="Người sinh ra con dâu"></div>
      <div class="field ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Mẹ đẻ của con dâu</label><input name="daughterInLawMother" value="${esc(person.daughterInLawMother)}" placeholder="Người sinh ra con dâu"></div>
      <div class="field ${isDaughter ? "" : "role-hidden"}" data-role-group="daughter"><label>Họ tên chồng</label><input name="daughterHusbandName" value="${esc(person.daughterHusbandName)}" placeholder="Nhập họ và tên chồng của con gái"></div>
      <div class="field ${isDaughter ? "" : "role-hidden"}" data-role-group="daughter"><label>Lấy chồng về đâu</label><input name="daughterMarriedAddress" value="${esc(person.daughterMarriedAddress)}" placeholder="Ví dụ: xóm/xã/huyện/tỉnh nhà chồng"></div>
      <div class="field ${isDaughter ? "" : "role-hidden"}" data-role-group="daughter"><label>Mấy người con</label><input name="daughterChildrenCount" type="number" min="0" step="1" value="${esc(person.daughterChildrenCount || "")}" placeholder="Ví dụ: 2"></div>
      <div class="field"><label>Địa chỉ ghi chú</label><input name="address" value="${esc(person.address)}" placeholder="Có thể bỏ trống nếu đã nhập nơi ở"></div>
      <div class="field"><label>Nghề nghiệp</label><input name="job" value="${esc(person.job)}"></div>
      <div class="field"><label>Trình độ học vấn</label><select name="educationLevel">${selectOptions(EDUCATION_LEVELS, person.educationLevel)}</select></div>
      <div class="field"><label>Học vị cao nhất</label><select name="academicDegree">${selectOptions(ACADEMIC_DEGREES, academicDegreeFor(person))}</select></div>
      <div class="field"><label>Học hàm nếu có</label><select name="academicRank">${selectOptions(ACADEMIC_RANKS, academicRankFor(person))}</select></div>
      <div class="field ${isDaughterInLaw ? "role-hidden" : ""}" data-role-group="birth-parent"><label>Bố đẻ</label>${selectPerson("fatherId", person.fatherId, person.id, false, parentPredicate, relationshipDisabled)}</div>
      <div class="field ${isDaughterInLaw ? "role-hidden" : ""}" data-role-group="birth-parent"><label>Mẹ đẻ</label>${selectPerson("motherId", person.motherId, person.id, false, parentPredicate, relationshipDisabled)}</div>
      <div class="field full ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Chồng trong dòng họ</label>${selectPerson("husbandId", husband?.id || "", person.id, false, (item) => item.familyRole !== "Con dâu", !adminCanEditAll())}</div>
      <div class="field full ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Bố mẹ chồng tự hiện theo chồng</label><div class="readonly-box" id="inLawPreview">${renderInLawPreview(husband?.id || "")}</div></div>
      <div class="field full ${isDaughterInLaw || isDaughter ? "role-hidden" : ""}" data-role-group="spouse"><label>Vợ/chồng cùng hàng</label>${selectPerson("spouseId", spouseId, person.id, false, () => true, !adminCanEditAll())}</div>
      <div class="field full"><label>Ảnh cá nhân</label><input name="photoFile" type="file" accept="image/*"><input name="photo" value="${esc(person.photo)}" placeholder="/uploads/photos/... hoặc link ảnh"></div>
      <div class="field full"><label>Ảnh khác, có thể chọn nhiều file</label><input name="galleryFiles" type="file" accept="image/*" multiple><textarea name="galleryPhotos" placeholder="Hoặc dán link ảnh, mỗi dòng một ảnh">${esc(galleryPhotos.join("\n"))}</textarea></div>
      <div class="field full"><label>Thành tích từ cấp huyện trở lên, mỗi dòng một thành tích</label><textarea name="achievements">${esc((person.achievements || []).join("\n"))}</textarea></div>
      <div class="field full form-subhead"><h3>Thông tin phần mộ</h3><p>Chỉ nhập khi có thông tin chính xác; có thể để trống.</p></div>
      <div class="field"><label>Khu/mộ phần</label><input name="graveLocation" value="${esc(person.graveLocation || "")}" placeholder="Ví dụ: Khu A, hàng 3, mộ số 12"></div>
      <div class="field"><label>Địa chỉ phần mộ</label><input name="graveAddress" value="${esc(person.graveAddress || "")}" placeholder="Thôn/xã/huyện/tỉnh"></div>
      <div class="field full"><label>Link vị trí bản đồ</label><input name="graveMapUrl" value="${esc(person.graveMapUrl || "")}" placeholder="https://maps.google.com/..."></div>
      <div class="field full"><label>Ảnh phần mộ</label><input name="gravePhotoFile" type="file" accept="image/*"><input name="gravePhoto" value="${esc(person.gravePhoto || "")}" placeholder="Link ảnh phần mộ"></div>
      <div class="field full"><label>Ghi chú phần mộ</label><textarea name="graveNotes" placeholder="Chỉ dẫn đường đi, ngày tu sửa hoặc thông tin cần lưu ý">${esc(person.graveNotes || "")}</textarea></div>
      <div class="field full"><label>Ghi chú</label><textarea name="notes">${esc(person.notes)}</textarea></div>
    </div>
  `;
}

function renderInLawPreview(husbandId) {
  const husband = personById(husbandId);
  if (!husband) return "Chưa chọn chồng.";
  const father = personById(husband.fatherId);
  const mother = personById(husband.motherId);
  return `
    <strong>Chồng:</strong> ${esc(husband.fullName)}<br>
    <strong>Bố chồng:</strong> ${father ? esc(father.fullName) : "Chưa cập nhật"}<br>
    <strong>Mẹ chồng:</strong> ${mother ? esc(mother.fullName) : "Chưa cập nhật"}
  `;
}

function selectPerson(name, selected, excludeId, multiple, predicate = () => true, disabled = false) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);
  const options = state.data.people
    .filter((person) => person.id !== excludeId && predicate(person))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"))
    .map((person) => `<option value="${esc(person.id)}" ${selectedSet.has(person.id) ? "selected" : ""}>${esc(person.fullName)}</option>`)
    .join("");
  return searchableSelect(`<select name="${name}" ${multiple ? "multiple" : ""} ${disabled ? "disabled" : ""}><option value="">Chưa chọn</option>${options}</select>`);
}

function bindAdmin() {
  bindSearchableSelects();
  $("#logoutBtn")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" });
    location.reload();
  });
  $("#adminSearch")?.addEventListener("input", (event) => {
    state.adminQuery = event.target.value;
    renderAdminPanel();
    const input = $("#adminSearch");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  $("#adminSearch")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const firstSuggestion = $(".admin-suggestion");
    if (!firstSuggestion) return;
    event.preventDefault();
    state.editingId = firstSuggestion.dataset.editId;
    state.adminQuery = personById(state.editingId)?.fullName || state.adminQuery;
    renderAdminPanel();
  });
  $$(".admin-suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = button.dataset.editId;
      state.adminQuery = personById(state.editingId)?.fullName || state.adminQuery;
      renderAdminPanel();
    });
  });
  $("#newPersonBtn")?.addEventListener("click", () => {
    state.editingId = "";
    renderAdminPanel();
  });
  $$(".admin-person-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.editingId = row.dataset.editId;
      renderAdminPanel();
    });
  });
  $("#personForm")?.addEventListener("submit", savePerson);
  $("#viewerAccountForm")?.addEventListener("submit", createViewerAccount);
  $$(".account-edit-form").forEach((form) => {
    form.addEventListener("submit", updateAccessAccount);
  });
  $$(".delete-viewer-user").forEach((button) => {
    button.addEventListener("click", () => deleteViewerAccount(button.dataset.username));
  });
  $$(".approve-request").forEach((button) => button.addEventListener("click", () => reviewChangeRequest(button.dataset.requestId, "approve")));
  $$(".reject-request").forEach((button) => button.addEventListener("click", () => reviewChangeRequest(button.dataset.requestId, "reject")));
  $("#personForm select[name=\"familyRole\"]")?.addEventListener("change", updateRoleFields);
  $("#personForm select[name=\"educationLevel\"]")?.addEventListener("change", updateEducationFields);
  $("#personForm select[name=\"husbandId\"]")?.addEventListener("change", updateInLawPreview);
  $("#deleteBtn")?.addEventListener("click", deletePerson);
  $("#exportBtn")?.addEventListener("click", exportJson);
  $("#importJson")?.addEventListener("change", importJson);
  $("#importCsv")?.addEventListener("change", importCsv);
  updateRoleFields();
  updateEducationFields();
}

async function reviewChangeRequest(id, decision) {
  if (!id) return;
  const reviewNote = decision === "reject" ? prompt("Lý do từ chối để thành viên biết và sửa lại:", "") : "";
  if (decision === "reject" && reviewNote === null) return;
  try {
    await api(`/api/change-requests/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ reviewNote }),
    });
    await Promise.all([loadData(), loadChangeRequests(), adminCanEditAll() ? loadStorageStats() : Promise.resolve()]);
    renderAdminPanel();
    toast(decision === "approve" ? "Đã duyệt và công khai thông tin." : "Đã từ chối yêu cầu.");
  } catch (error) {
    toast(error.message);
  }
}

async function createViewerAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        displayName: formData.get("displayName"),
        username: formData.get("username"),
        password: formData.get("password"),
        role: formData.get("role"),
        personId: formData.get("personId"),
      }),
    });
    form.reset();
    await Promise.all([loadViewerAccounts(), loadStorageStats()]);
    renderAdminPanel();
    toast("Đã tạo tài khoản.");
  } catch (error) {
    toast(error.message);
  }
}

async function updateAccessAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = form.dataset.username;
  const formData = new FormData(form);
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify({
        displayName: formData.get("displayName"),
        role: formData.get("role"),
        personId: formData.get("personId"),
        password: formData.get("password"),
      }),
    });
    await Promise.all([loadViewerAccounts(), loadStorageStats()]);
    renderAdminPanel();
    toast("Đã cập nhật tài khoản.");
  } catch (error) {
    toast(error.message);
  }
}

async function deleteViewerAccount(username) {
  if (!username || !confirm(`Xóa tài khoản ${username}?`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    await Promise.all([loadViewerAccounts(), loadStorageStats()]);
    renderAdminPanel();
    toast("Đã xóa tài khoản.");
  } catch (error) {
    toast(error.message);
  }
}

function updateRoleFields() {
  const form = $("#personForm");
  if (!form) return;
  const isDaughterInLaw = form.elements.familyRole?.value === "Con dâu";
  const isDaughter = form.elements.familyRole?.value === "Con gái";
  $$('[data-role-group="inlaw"]', form).forEach((item) => item.classList.toggle("role-hidden", !isDaughterInLaw));
  $$('[data-role-group="daughter"]', form).forEach((item) => item.classList.toggle("role-hidden", !isDaughter));
  $$('[data-role-group="birth-parent"]', form).forEach((item) => item.classList.toggle("role-hidden", isDaughterInLaw));
  $$('[data-role-group="spouse"]', form).forEach((item) => item.classList.toggle("role-hidden", isDaughterInLaw || isDaughter));
  if (isDaughterInLaw && form.elements.gender) form.elements.gender.value = "Nữ";
  if (isDaughter && form.elements.gender) form.elements.gender.value = "Nữ";
  updateInLawPreview();
}

function updateInLawPreview() {
  const form = $("#personForm");
  const preview = $("#inLawPreview");
  if (!form || !preview) return;
  preview.innerHTML = renderInLawPreview(form.elements.husbandId?.value || "");
}

async function login(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Đang đăng nhập...";
  }
  const form = new FormData(formElement);
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    await renderAdmin();
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Đăng nhập";
    }
  }
}

function updateEducationFields() {
  const form = $("#personForm");
  if (!form) return;
  const education = form.elements.educationLevel?.value || "";
  const degree = form.elements.academicDegree;
  if (!degree) return;
  if (["Cao đẳng", "Đại học"].includes(education) && !degree.value) degree.value = "Cử nhân";
  if (!["Cao đẳng", "Đại học"].includes(education) && degree.value === "Cử nhân") degree.value = "";
}

async function savePerson(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton?.disabled) return;
  if (submitButton) submitButton.disabled = true;
  const formData = new FormData(form);
  let photo = String(formData.get("photo") || "").trim();
  const file = formData.get("photoFile");
  let gravePhoto = String(formData.get("gravePhoto") || "").trim();
  const gravePhotoFile = formData.get("gravePhotoFile");
  const galleryFiles = Array.from(formData.getAll("galleryFiles")).filter((item) => item && item.size);
  try {
    if (file && file.size) {
      photo = await uploadPhoto(file);
    } else {
      photo = await ensureStoredPhoto(photo);
    }
    if (gravePhotoFile && gravePhotoFile.size) {
      gravePhoto = await uploadPhoto(gravePhotoFile);
    } else {
      gravePhoto = await ensureStoredPhoto(gravePhoto);
    }
    const uploadedGallery = galleryFiles.length ? await Promise.all(galleryFiles.map(uploadPhoto)) : [];
    const existingGallery = String(formData.get("galleryPhotos") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const storedExistingGallery = existingGallery.length ? await Promise.all(existingGallery.map(ensureStoredPhoto)) : [];
    const payload = {
      fullName: formData.get("fullName"),
      gender: formData.get("gender"),
      birthDate: formData.get("birthDate"),
      deathDate: formData.get("deathDate"),
      marriageYear: formData.get("marriageYear"),
      familyRole: formData.get("familyRole"),
      hometown: formData.get("hometown"),
      currentResidence: formData.get("currentResidence"),
      daughterInLawFather: formData.get("familyRole") === "Con dâu" ? formData.get("daughterInLawFather") : "",
      daughterInLawMother: formData.get("familyRole") === "Con dâu" ? formData.get("daughterInLawMother") : "",
      daughterHusbandName: formData.get("familyRole") === "Con gái" ? formData.get("daughterHusbandName") : "",
      daughterMarriedAddress: formData.get("familyRole") === "Con gái" ? formData.get("daughterMarriedAddress") : "",
      daughterChildrenCount: formData.get("familyRole") === "Con gái" ? formData.get("daughterChildrenCount") : "",
      address: formData.get("address"),
      job: formData.get("job"),
      educationLevel: formData.get("educationLevel"),
      academicDegree: formData.get("academicDegree"),
      academicRank: formData.get("academicRank"),
      fatherId: formData.get("familyRole") === "Con dâu" ? "" : formData.get("fatherId"),
      motherId: formData.get("familyRole") === "Con dâu" ? "" : formData.get("motherId"),
      spouseIds: formData.get("familyRole") === "Con dâu"
        ? [formData.get("husbandId")].filter(Boolean)
        : (formData.get("familyRole") === "Con gái" ? [] : [formData.get("spouseId")].filter(Boolean)),
      photo,
      galleryPhotos: [...storedExistingGallery, ...uploadedGallery],
      graveLocation: formData.get("graveLocation"),
      graveAddress: formData.get("graveAddress"),
      graveMapUrl: formData.get("graveMapUrl"),
      graveNotes: formData.get("graveNotes"),
      gravePhoto,
      achievements: String(formData.get("achievements") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      notes: formData.get("notes"),
    };
    if (payload.familyRole === "Con dâu" && !payload.spouseIds.length) {
      toast("Con dâu cần chọn chồng trong dòng họ để gắn cùng hàng.");
      return;
    }
    const method = state.editingId ? "PUT" : "POST";
    const path = state.editingId ? `/api/people/${encodeURIComponent(state.editingId)}` : "/api/people";
    const saved = await api(path, { method, body: JSON.stringify(payload) });
    await Promise.all([loadData(), adminCanEditAll() ? loadStorageStats() : Promise.resolve(), loadChangeRequests()]);
    state.editingId = saved.pendingApproval && !personById(saved.id) ? (state.currentAdmin?.personId || "") : saved.id;
    renderAdminPanel();
    toast(saved.pendingApproval ? "Đã gửi Admin duyệt. Trang xem chưa thay đổi cho tới khi được duyệt." : "Đã lưu thông tin.");
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không xử lý được ảnh này."));
    image.src = dataUrl;
  });
}

async function compressDataUrl(originalDataUrl) {
  const image = await loadImage(originalDataUrl);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 950000 && quality > 0.48) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrl.length > 1200000) {
    throw new Error("Ảnh vẫn quá lớn sau khi nén. Hãy chọn ảnh nhỏ hơn hoặc gửi ảnh đã giảm dung lượng.");
  }
  return dataUrl;
}

async function compressPhoto(file) {
  return compressDataUrl(await readFileAsDataUrl(file));
}

async function uploadDataUrl(dataUrl, filename = "photo.jpg") {
  const result = await api("/api/photos", {
    method: "POST",
    body: JSON.stringify({ filename, dataUrl }),
  });
  return result.url;
}

async function uploadPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ hỗ trợ file ảnh.");
  const dataUrl = await compressPhoto(file);
  return uploadDataUrl(dataUrl, file.name);
}

async function ensureStoredPhoto(value) {
  const url = String(value || "").trim();
  if (!url || !url.startsWith("data:image/")) return url;
  return uploadDataUrl(await compressDataUrl(url));
}

async function deletePerson() {
  const person = personById(state.editingId);
  if (!person || !confirm(`Xóa ${person.fullName}? Quan hệ liên quan cũng sẽ được gỡ.`)) return;
  try {
    await api(`/api/people/${encodeURIComponent(person.id)}`, { method: "DELETE" });
    await Promise.all([loadData(), loadStorageStats()]);
    state.editingId = state.data.people[0]?.id || "";
    renderAdminPanel();
    toast("Đã xóa.");
  } catch (error) {
    toast(error.message);
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gia-pha.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file || !confirm("Nhập JSON sẽ thay toàn bộ dữ liệu hiện tại. Bạn muốn tiếp tục?")) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      state.data = await api("/api/import", { method: "POST", body: JSON.stringify(data) });
      await loadStorageStats();
      state.editingId = state.data.people[0]?.id || "";
      renderAdminPanel();
      toast("Đã nhập JSON.");
    } catch (error) {
      toast(error.message);
    }
  };
  reader.readAsText(file, "utf-8");
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file || !confirm("Nhập CSV sẽ thay toàn bộ dữ liệu hiện tại. Bạn muốn tiếp tục?")) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const people = csvToPeople(reader.result);
      state.data = await api("/api/import", {
        method: "POST",
        body: JSON.stringify({ familyName: state.data.familyName, people }),
      });
      await loadStorageStats();
      state.editingId = state.data.people[0]?.id || "";
      renderAdminPanel();
      toast(`Đã nhập ${people.length} người từ CSV.`);
    } catch (error) {
      toast(error.message);
    }
  };
  reader.readAsText(file, "utf-8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function csvToPeople(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV cần có dòng tiêu đề và ít nhất một người.");
  const headers = rows[0].map((item) => item.trim());
  const people = rows.slice(1).map((row, index) => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = (row[i] || "").trim();
    });
    return {
      id: record.id || `csv_${index + 1}_${Date.now()}`,
      fullName: record.fullName || record.hoTen || record.name,
      gender: record.gender || record.gioiTinh || "Khác",
      birthDate: record.birthDate || record.ngaySinh || "",
      deathDate: record.deathDate || record.ngayMat || "",
      marriageYear: record.marriageYear || record.namLapGiaDinh || record.namCuoi || "",
      familyRole: record.familyRole || record.vaiTro || record.loai || "Khác",
      hometown: record.hometown || record.queQuan || record.que || "",
      currentResidence: record.currentResidence || record.dangO || record.noiOHienNay || "",
      daughterInLawFather: record.daughterInLawFather || record.boConDau || record.boCuaConDau || "",
      daughterInLawMother: record.daughterInLawMother || record.meConDau || record.meCuaConDau || "",
      daughterHusbandName: record.daughterHusbandName || record.chongConGai || record.hoTenChong || "",
      daughterMarriedAddress: record.daughterMarriedAddress || record.layChongVeDau || record.queChong || "",
      daughterChildrenCount: record.daughterChildrenCount || record.soNguoiCon || record.soCon || record.mayNguoiCon || "",
      address: record.address || record.diaChi || "",
      job: record.job || record.ngheNghiep || "",
      educationLevel: record.educationLevel || record.trinhDo || record.hocVan || "",
      academicDegree: record.academicDegree || record.hocVi || (["Cử nhân", "Thạc sĩ", "Tiến sĩ"].includes(record.academicTitle) ? record.academicTitle : ""),
      academicRank: record.academicRank || record.hocHam || (["PGS", "GS"].includes(record.academicTitle) ? record.academicTitle : ""),
      academicTitle: record.academicTitle || record.hocHamHocVi || "",
      achievements: String(record.achievements || record.thanhTich || "").split(";").map((item) => item.trim()).filter(Boolean),
      fatherId: record.fatherId || "",
      motherId: record.motherId || "",
      spouseIds: String(record.spouseIds || "").split(";").map((item) => item.trim()).filter(Boolean),
      photo: record.photo || "",
      galleryPhotos: String(record.galleryPhotos || record.anhKhac || "").split(";").map((item) => item.trim()).filter(Boolean),
      notes: record.notes || record.ghiChu || "",
      fatherName: record.fatherName || record.tenBo || "",
      motherName: record.motherName || record.tenMe || "",
      spouseNames: record.spouseNames || record.tenVoChong || "",
    };
  }).filter((person) => person.fullName);

  const nameToId = new Map();
  people.forEach((person) => {
    if (!nameToId.has(normalizeText(person.fullName))) nameToId.set(normalizeText(person.fullName), person.id);
  });
  people.forEach((person) => {
    if (!person.fatherId && person.fatherName) person.fatherId = nameToId.get(normalizeText(person.fatherName)) || "";
    if (!person.motherId && person.motherName) person.motherId = nameToId.get(normalizeText(person.motherName)) || "";
    if (person.spouseNames) {
      person.spouseIds = person.spouseNames.split(";").map((name) => nameToId.get(normalizeText(name))).filter(Boolean);
    }
    delete person.fatherName;
    delete person.motherName;
    delete person.spouseNames;
  });
  return people;
}

function toast(message) {
  const root = $("#toastRoot") || document.body;
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  setTimeout(() => {
    const toastEl = $(".toast");
    if (toastEl) toastEl.remove();
  }, 2600);
}

async function start() {
  try {
    if (state.isAdmin) {
      await renderAdmin();
      return;
    }
    await loadViewerSession();
    if (!state.viewerAuthenticated) {
      renderViewerAuth();
      return;
    }
    await loadData();
    renderPublic();
  } catch (error) {
    app.innerHTML = `<div class="empty-state">Không tải được dữ liệu: ${esc(error.message)}</div>`;
  }
}

start();
