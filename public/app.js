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
  isAdmin: location.pathname === "/admin",
  authenticated: false,
  viewerAuthenticated: false,
  viewerUser: null,
  viewerAccounts: [],
  currentAdmin: null,
  storageStats: null,
  menuOpen: false,
  editingId: "",
  adminQuery: "",
  staticMode: false,
  touch: null,
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
  achievements: [],
  fatherId: "",
  motherId: "",
  spouseIds: [],
  photo: "",
  galleryPhotos: [],
  notes: "",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const app = $("#app");

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    throw new Error("Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) throw new Error("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn hoặc để web tự nén lại rồi thử lần nữa.");
    if (response.status === 401) throw new Error(data.error || "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    throw new Error(data.error || "Có lỗi xảy ra.");
  }
  return data;
}

async function loadData() {
  try {
    state.data = await api("/api/people");
    state.staticMode = false;
  } catch (error) {
    const response = await fetch("family.json", { cache: "no-store" });
    if (!response.ok) throw error;
    state.data = await response.json();
    state.staticMode = true;
    state.isAdmin = false;
  }
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
  } catch (error) {
    state.staticMode = true;
    state.viewerUser = staticViewerUser();
    state.viewerAuthenticated = !!state.viewerUser;
  }
}

async function loadViewerAccounts() {
  try {
    const result = await api("/api/admin/users");
    state.viewerAccounts = result.users || [];
    state.currentAdmin = result.currentUser || null;
  } catch (error) {
    state.viewerAccounts = [];
    state.currentAdmin = null;
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
  return state.data.people.find((person) => person.id === id);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
        <img class="${className}" src="${esc(assetUrl(person.photo))}" alt="${esc(person.fullName)}">
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
    rowGapAfter.set(gen, BASE_ROW_GAP + Math.min(420, extraForRelations + extraForChildren + extraForCrowding));
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
        let x = band.target - totalWidth / 2;
        band.groups.forEach((group) => {
          rowItems.push({ group, x, width: groupWidth(group), target: band.target });
          x += groupWidth(group) + GROUP_GAP;
        });
      });
      looseGroups
        .sort((a, b) => (groupAnchor(a)?.fullName || "").localeCompare(groupAnchor(b)?.fullName || "", "vi"))
        .forEach((group) => {
          rowItems.push({ group, x: 0, width: groupWidth(group), target: null });
        });

      rowItems.sort((a, b) => {
        const targetA = a.target ?? Number.MAX_SAFE_INTEGER;
        const targetB = b.target ?? Number.MAX_SAFE_INTEGER;
        if (targetA !== targetB) return targetA - targetB;
        return a.x - b.x;
      });

      let cursor = null;
      rowItems.forEach((item) => {
        if (cursor !== null && item.x < cursor + GROUP_GAP) item.x = cursor + GROUP_GAP;
        cursor = item.x + item.width;
      });

      rowItems.forEach((item) => {
        item.group.forEach((id, index) => {
          positions.set(id, { x: item.x + index * (CARD_W + SPOUSE_GAP), y, w: CARD_W, h: CARD_H, gen });
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

  return {
    byId,
    children,
    positions,
    groupsByGen,
    cardW: CARD_W,
    cardH: CARD_H,
    photoW: PHOTO_W,
    photoH: PHOTO_H,
    width: Math.max(maxX + PADDING, 900),
    height: Math.max(maxY + PADDING, 600),
  };
}

function renderPublic() {
  const stats = getStats();
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(false)}
      <main class="workspace">
        ${renderControlMenu(stats)}
        ${state.view === "tree" ? renderTree() : renderList()}
      </main>
      ${state.selectedId ? renderDetail(state.selectedId) : ""}
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
  return `
    <section class="floating-tools ${state.menuOpen ? "open" : ""}">
      <button class="menu-toggle" id="menuToggle" type="button" title="Công cụ" aria-label="Công cụ">${icon("menu")}</button>
      <div class="menu-panel">
        <div class="menu-section">
          <h3>Tìm kiếm</h3>
          <label class="searchbar compact-search">
            <span class="search-icon" title="Tìm kiếm">${icon("search")}</span>
            <input id="searchInput" value="${esc(state.query)}" placeholder="Tên, địa chỉ, nghề nghiệp...">
          </label>
        </div>
        <div class="menu-section">
          <h3>Kiểu xem</h3>
          <div class="segmented">
            <button class="icon-btn ${state.view === "tree" ? "active" : ""}" data-view="tree" title="Sơ đồ" aria-label="Sơ đồ">${icon("tree")}</button>
            <button class="icon-btn ${state.view === "list" ? "active" : ""}" data-view="list" title="Danh sách" aria-label="Danh sách">${icon("list")}</button>
          </div>
        </div>
        <div class="menu-section">
          <h3>Thu phóng</h3>
          <div class="zoom-controls">
            <button class="icon-btn" data-zoom="out" title="Thu nhỏ" aria-label="Thu nhỏ">${icon("minus")}</button>
            <button class="icon-btn" data-zoom="fit" title="Vừa khung" aria-label="Vừa khung">${icon("fit")}</button>
            <button class="icon-btn" data-zoom="in" title="Phóng to" aria-label="Phóng to">${icon("plus")}</button>
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

function topbar(admin) {
  const viewerName = state.viewerUser?.displayName || state.viewerUser?.username || "";
  return `
    <header class="topbar">
      <a class="brand" href="${state.staticMode ? "./" : "/"}">
        <div class="brand-mark">NH</div>
        <div>
          <h1>${esc(state.data.familyName || "Gia phả dòng họ Nguyễn Hữu")}</h1>
          <p>${admin ? "Khu vực quản trị thông tin gia phả" : viewerName ? `Xin chào ${esc(viewerName)}` : "Đăng nhập để xem gia phả"}</p>
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
  const haystack = normalizeText([
    person.fullName,
    person.gender,
    person.familyRole,
    person.birthDate,
    person.deathDate,
    person.marriageYear,
    person.address,
    person.hometown,
    person.currentResidence,
    person.daughterInLawFather,
    person.daughterInLawMother,
    person.daughterHusbandName,
    person.daughterMarriedAddress,
    person.daughterChildrenCount,
    person.job,
    person.notes,
    ...(person.achievements || []),
  ].join(" "));
  return haystack.includes(normalizeText(state.query));
}

function rangesOverlap(a, b, gap = 10) {
  return a.start <= b.end + gap && b.start <= a.end + gap;
}

function routeTreeEdgeGroups(groups) {
  const HORIZONTAL_GAP = 28;
  const VERTICAL_LANE_GAP = 16;
  const CROSS_GAP = 7;
  const occupiedHorizontals = [];
  const occupiedVerticals = [];
  const between = (value, a, b, gap = 0) => value >= Math.min(a, b) - gap && value <= Math.max(a, b) + gap;
  const xInSpan = (x, span, gap = 0) => x >= span.start - gap && x <= span.end + gap;
  const verticalSegmentsFor = (item, y) => [
    { x: item.group.parentX, startY: item.group.parentY, endY: y },
    ...item.childXs.map((childX) => ({ x: childX, startY: y, endY: item.group.childY - 8 })),
  ];
  const conflictScore = (item, y) => {
    let score = 0;
    occupiedHorizontals.forEach((line) => {
      if (Math.abs(line.y - y) < VERTICAL_LANE_GAP && rangesOverlap(item.span, line, HORIZONTAL_GAP)) score += 100;
      verticalSegmentsFor(item, y).forEach((vertical) => {
        if (xInSpan(vertical.x, line, CROSS_GAP) && between(line.y, vertical.startY, vertical.endY, CROSS_GAP)) score += 18;
      });
    });
    occupiedVerticals.forEach((line) => {
      if (xInSpan(line.x, item.span, CROSS_GAP) && between(y, line.startY, line.endY, CROSS_GAP)) score += 18;
    });
    return score;
  };
  const candidateYs = (top, bottom, ideal, childY) => {
    const minY = Math.min(top, bottom);
    const maxY = Math.max(top, bottom);
    const values = [];
    const add = (value) => {
      const rounded = Math.round(value);
      if (rounded < top - 36 || rounded > childY - 22) return;
      if (!values.includes(rounded)) values.push(rounded);
    };
    add(ideal);
    for (let offset = VERTICAL_LANE_GAP; offset <= Math.max(80, maxY - minY + VERTICAL_LANE_GAP); offset += VERTICAL_LANE_GAP) {
      add(ideal - offset);
      add(ideal + offset);
    }
    for (let y = minY; y <= maxY; y += VERTICAL_LANE_GAP) add(y);
    for (let y = maxY + VERTICAL_LANE_GAP; y <= childY - 24; y += VERTICAL_LANE_GAP) add(y);
    return values;
  };

  groups
    .map((group) => {
      const childXs = [...new Set(group.childXs)].sort((a, b) => a - b);
      const span = {
        start: Math.min(group.parentX, ...childXs),
        end: Math.max(group.parentX, ...childXs),
      };
      const top = group.parentY + 24;
      const bottom = group.childY - 42;
      const ideal = top < bottom ? top + (bottom - top) / 2 : group.parentY + (group.childY - group.parentY) / 2;
      return { group, childXs, span, top, bottom, ideal };
    })
    .sort((a, b) => {
      const verticalDiff = a.top - b.top;
      if (Math.abs(verticalDiff) > 4) return verticalDiff;
      const widthDiff = (b.span.end - b.span.start) - (a.span.end - a.span.start);
      if (widthDiff !== 0) return widthDiff;
      return a.span.start - b.span.start;
    })
    .forEach((item) => {
      const candidates = candidateYs(item.top, item.bottom, item.ideal, item.group.childY);
      let y = candidates.find((candidate) => conflictScore(item, candidate) === 0);
      if (y === undefined) {
        y = candidates
          .map((candidate) => ({ y: candidate, score: conflictScore(item, candidate), distance: Math.abs(candidate - item.ideal) }))
          .sort((a, b) => a.score - b.score || a.distance - b.distance)[0]?.y || Math.round(item.ideal);
      }
      item.group.midY = y;
      occupiedHorizontals.push({ ...item.span, y });
      occupiedVerticals.push(...verticalSegmentsFor(item, y));
    });

  return groups;
}

function renderTree() {
  if (!state.data.people.length) return `<section class="empty-state list-panel">Chưa có dữ liệu gia phả.</section>`;
  const layout = buildLayout();
  const queryActive = state.query.trim();
  const spouseLines = [];
  const edgeGroups = new Map();

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
    const fatherCenter = fatherPos ? fatherPos.x + fatherPos.w / 2 : parentX;
    const childX = pos.x + pos.w / 2;
    const childY = pos.y;
    const relationKey = `${person.fatherId || "_"}|${person.motherId || "_"}`;
    const groupKey = `${relationKey}|${Math.round(childY)}`;
    if (!edgeGroups.has(groupKey)) {
      edgeGroups.set(groupKey, { relationKey, fatherId: person.fatherId || "", parentX, parentY, childY, childXs: [], side: parentX - fatherCenter });
    }
    edgeGroups.get(groupKey).childXs.push(childX);
  });

  const routedEdgeGroups = routeTreeEdgeGroups(Array.from(edgeGroups.values()));
  const edgeMaxY = routedEdgeGroups.reduce((max, group) => Math.max(max, group.midY || 0, group.childY || 0, group.parentY || 0), 0);
  layout.height = Math.max(layout.height, edgeMaxY + 96);

  const edges = routedEdgeGroups.flatMap((group) => {
    const childXs = [...new Set(group.childXs)].sort((a, b) => a - b);
    const branchStart = Math.min(group.parentX, ...childXs);
    const branchEnd = Math.max(group.parentX, ...childXs);
    const paths = [
      `M ${group.parentX} ${group.parentY} V ${group.midY} M ${branchStart} ${group.midY} H ${branchEnd}`,
      ...childXs.map((childX) => `M ${childX} ${group.midY} V ${group.childY - 8}`),
    ];
    return paths.flatMap((path, index) => [
      `<path class="edge-halo" d="${path}"></path>`,
      `<path class="edge" ${index ? `marker-end="url(#arrow)"` : ""} d="${path}"></path>`,
    ]);
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
      <div class="tree-canvas" id="treeCanvas" style="width:${layout.width}px;height:${layout.height}px;--card-w:${layout.cardW}px;--card-h:${layout.cardH}px;--photo-w:${layout.photoW}px;--photo-h:${layout.photoH}px">
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
  return state.data.people.filter(personMatches).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
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
        <td>${esc((person.achievements || []).join("; "))}</td>
      </tr>
    `;
  }).join("");
  return `
    <section class="list-panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Họ tên</th><th>Vai trò</th><th>Thứ tự</th><th>Trạng thái</th><th>Ngày sinh</th><th>Năm lập gia đình</th><th>Bố mẹ / bên chồng</th><th>Vợ/chồng</th><th>Quê quán</th><th>Đang ở</th><th>Nghề nghiệp</th><th>Thành tích</th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="12">Không tìm thấy người phù hợp.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
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
          <dt>Thành tích</dt><dd>${(person.achievements || []).length ? `<div class="chips">${person.achievements.map((item) => `<span class="chip">${esc(item)}</span>`).join("")}</div>` : "Chưa cập nhật"}</dd>
          <dt>Ghi chú</dt><dd>${esc(person.notes || "Không có")}</dd>
        </dl>
        ${galleryPhotos.length ? `
          <section class="gallery-section">
            <h3>Ảnh khác</h3>
            <div class="gallery-grid">
              ${galleryPhotos.map((url, index) => `
                <button class="gallery-photo" data-photo-url="${esc(assetUrl(url))}" data-photo-title="${esc(`${person.fullName} - ảnh ${index + 1}`)}" type="button">
                  <img src="${esc(assetUrl(url))}" alt="${esc(`${person.fullName} ảnh ${index + 1}`)}">
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
  $("#menuToggle")?.addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    renderPublic();
  });
  $("#viewerLogoutBtn")?.addEventListener("click", logoutViewer);
  $("#searchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.menuOpen = true;
    renderPublic();
  });
  $$(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.menuOpen = false;
      renderPublic();
    });
  });
  $$(".zoom-controls button").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.zoom;
      if (action === "in") state.scale = Math.min(1.8, state.scale + 0.12);
      if (action === "out") state.scale = Math.max(0.28, state.scale - 0.12);
      if (action === "fit") {
        state.scale = 0.72;
        state.pan = { x: 40, y: 28 };
      }
      state.menuOpen = true;
      applyTransform();
    });
  });
  $$(".pan-pad button").forEach((button) => {
    button.addEventListener("click", () => nudgePan(button.dataset.pan));
  });
  $$(".person-card, tbody tr, .inline-person").forEach((item) => {
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
}

async function handleViewerAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
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
    await loadData();
    renderPublic();
  } catch (error) {
    toast(error.message);
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
  if (!state.authenticated) {
    app.innerHTML = `
      <div class="app-shell">
        ${topbar(true)}
        <main class="login-screen">
          <form class="login-panel" id="loginForm">
            <h2>Đăng nhập admin</h2>
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
  await Promise.all([loadViewerAccounts(), loadStorageStats()]);
  renderAdminPanel();
}

function renderAdminPanel() {
  const people = state.data.people
    .filter((person) => !state.adminQuery || normalizeText([
      person.fullName,
      person.familyRole,
      person.birthDate,
      person.deathDate,
      person.marriageYear,
      person.job,
      person.address,
      person.hometown,
      person.currentResidence,
      person.daughterInLawFather,
      person.daughterInLawMother,
      person.daughterHusbandName,
      person.daughterMarriedAddress,
      person.daughterChildrenCount,
    ].join(" ")).includes(normalizeText(state.adminQuery)))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  const editing = personById(state.editingId) || { ...emptyPerson };
  app.innerHTML = `
    <div class="app-shell">
      ${topbar(true)}
      <main class="workspace">
        <section class="admin-layout">
          <aside class="admin-panel admin-sidebar">
            <div class="panel-head">
              <h2>Danh sách ${state.data.people.length} người</h2>
              <label class="searchbar"><span class="search-icon" title="Tìm kiếm">${icon("search")}</span><input id="adminSearch" value="${esc(state.adminQuery)}" placeholder="Tìm người để sửa"></label>
              <div class="import-actions">
                <button class="btn" id="newPersonBtn">Thêm người</button>
                <button class="ghost-btn" id="exportBtn">Xuất JSON</button>
                <label class="ghost-btn">Nhập JSON<input id="importJson" type="file" accept=".json,application/json" hidden></label>
                <label class="ghost-btn">Nhập CSV<input id="importCsv" type="file" accept=".csv,text/csv" hidden></label>
              </div>
              ${storageSummary()}
            </div>
            <div class="person-list">
              ${people.map((person) => `
                <button class="admin-person-row ${person.id === state.editingId ? "active" : ""}" data-edit-id="${esc(person.id)}">
                  ${person.photo ? `<img class="mini-avatar" src="${esc(assetUrl(person.photo))}" alt="">` : `<span class="mini-avatar avatar-fallback">${esc(initials(person.fullName))}</span>`}
                  <span><strong>${esc(person.fullName)}</strong><br><span class="person-meta">${esc(person.familyRole || person.job || personResidence(person) || "Chưa cập nhật")}</span></span>
                </button>
              `).join("")}
            </div>
            <div class="viewer-account-box">
              <h3>Tài khoản truy cập</h3>
              <form id="viewerAccountForm" class="viewer-account-form">
                <input name="displayName" placeholder="Tên hiển thị">
                <input name="username" placeholder="Tài khoản" autocomplete="off" required>
                <input name="password" type="password" placeholder="Mật khẩu" autocomplete="new-password" required>
                <select name="role" aria-label="Loại tài khoản">
                  <option value="viewer">Người xem</option>
                  <option value="admin">Admin phụ</option>
                </select>
                <button class="btn" type="submit">Tạo tài khoản</button>
              </form>
              <div class="viewer-account-list">
                ${state.viewerAccounts.length ? state.viewerAccounts.map((user) => `
                  <form class="viewer-account-row account-edit-form" data-username="${esc(user.username)}">
                    <span class="account-main">
                      <strong>${esc(user.displayName || user.username)}</strong>
                      <small>${esc(user.username)} · ${user.role === "admin" ? "Admin" : "Người xem"}${user.locked ? " · khóa gốc" : ""}</small>
                    </span>
                    <input name="displayName" value="${esc(user.displayName || "")}" ${user.locked ? "disabled" : ""} placeholder="Tên hiển thị">
                    <select name="role" ${user.locked ? "disabled" : ""} aria-label="Loại tài khoản">
                      <option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Người xem</option>
                      <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin phụ</option>
                    </select>
                    <input name="password" type="password" ${user.locked ? "disabled" : ""} placeholder="Mật khẩu mới">
                    <div class="account-actions">
                      ${user.locked ? `<span class="account-lock">Không thể sửa/xóa</span>` : `
                        <button class="text-btn update-account" type="submit">Lưu</button>
                        <button class="text-btn delete-viewer-user" data-username="${esc(user.username)}" type="button">Xóa</button>
                      `}
                    </div>
                  </form>
                `).join("") : `<p class="notice">Chưa có tài khoản nào.</p>`}
              </div>
            </div>
          </aside>
          <section class="admin-panel">
            <form class="form-wrap" id="personForm">
              <h2>${editing.id ? "Sửa thông tin" : "Thêm người mới"}</h2>
              <p class="notice">Chọn bố, mẹ và vợ/chồng bằng danh sách bên dưới. Quan hệ vợ/chồng sẽ tự đồng bộ hai chiều.</p>
              ${personForm(editing)}
              <div class="form-actions">
                <button class="btn" type="submit">Lưu thông tin</button>
                ${editing.id ? `<button class="danger-btn" type="button" id="deleteBtn">Xóa người này</button>` : ""}
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
      <div class="field ${isDaughterInLaw ? "role-hidden" : ""}" data-role-group="birth-parent"><label>Bố đẻ</label>${selectPerson("fatherId", person.fatherId, person.id, false)}</div>
      <div class="field ${isDaughterInLaw ? "role-hidden" : ""}" data-role-group="birth-parent"><label>Mẹ đẻ</label>${selectPerson("motherId", person.motherId, person.id, false)}</div>
      <div class="field full ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Chồng trong dòng họ</label>${selectPerson("husbandId", husband?.id || "", person.id, false, (item) => item.familyRole !== "Con dâu")}</div>
      <div class="field full ${isDaughterInLaw ? "" : "role-hidden"}" data-role-group="inlaw"><label>Bố mẹ chồng tự hiện theo chồng</label><div class="readonly-box" id="inLawPreview">${renderInLawPreview(husband?.id || "")}</div></div>
      <div class="field full ${isDaughterInLaw || isDaughter ? "role-hidden" : ""}" data-role-group="spouse"><label>Vợ/chồng cùng hàng</label>${selectPerson("spouseId", spouseId, person.id, false)}</div>
      <div class="field full"><label>Ảnh cá nhân</label><input name="photoFile" type="file" accept="image/*"><input name="photo" value="${esc(person.photo)}" placeholder="/uploads/photos/... hoặc link ảnh"></div>
      <div class="field full"><label>Ảnh khác, có thể chọn nhiều file</label><input name="galleryFiles" type="file" accept="image/*" multiple><textarea name="galleryPhotos" placeholder="Hoặc dán link ảnh, mỗi dòng một ảnh">${esc(galleryPhotos.join("\n"))}</textarea></div>
      <div class="field full"><label>Thành tích từ cấp huyện trở lên, mỗi dòng một thành tích</label><textarea name="achievements">${esc((person.achievements || []).join("\n"))}</textarea></div>
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

function selectPerson(name, selected, excludeId, multiple, predicate = () => true) {
  const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);
  const options = state.data.people
    .filter((person) => person.id !== excludeId && predicate(person))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"))
    .map((person) => `<option value="${esc(person.id)}" ${selectedSet.has(person.id) ? "selected" : ""}>${esc(person.fullName)}</option>`)
    .join("");
  return `<select name="${name}" ${multiple ? "multiple" : ""}><option value="">Chưa chọn</option>${options}</select>`;
}

function bindAdmin() {
  $("#logoutBtn")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" });
    location.reload();
  });
  $("#adminSearch").addEventListener("input", (event) => {
    state.adminQuery = event.target.value;
    renderAdminPanel();
  });
  $("#newPersonBtn").addEventListener("click", () => {
    state.editingId = "";
    renderAdminPanel();
  });
  $$(".admin-person-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.editingId = row.dataset.editId;
      renderAdminPanel();
    });
  });
  $("#personForm").addEventListener("submit", savePerson);
  $("#viewerAccountForm")?.addEventListener("submit", createViewerAccount);
  $$(".account-edit-form").forEach((form) => {
    form.addEventListener("submit", updateAccessAccount);
  });
  $$(".delete-viewer-user").forEach((button) => {
    button.addEventListener("click", () => deleteViewerAccount(button.dataset.username));
  });
  $("#personForm select[name=\"familyRole\"]")?.addEventListener("change", updateRoleFields);
  $("#personForm select[name=\"husbandId\"]")?.addEventListener("change", updateInLawPreview);
  $("#deleteBtn")?.addEventListener("click", deletePerson);
  $("#exportBtn").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", importJson);
  $("#importCsv").addEventListener("change", importCsv);
  updateRoleFields();
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
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    await loadData();
    await renderAdmin();
  } catch (error) {
    toast(error.message);
  }
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
  const galleryFiles = Array.from(formData.getAll("galleryFiles")).filter((item) => item && item.size);
  try {
    if (file && file.size) {
      photo = await uploadPhoto(file);
    } else {
      photo = await ensureStoredPhoto(photo);
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
      fatherId: formData.get("familyRole") === "Con dâu" ? "" : formData.get("fatherId"),
      motherId: formData.get("familyRole") === "Con dâu" ? "" : formData.get("motherId"),
      spouseIds: formData.get("familyRole") === "Con dâu"
        ? [formData.get("husbandId")].filter(Boolean)
        : (formData.get("familyRole") === "Con gái" ? [] : [formData.get("spouseId")].filter(Boolean)),
      photo,
      galleryPhotos: [...storedExistingGallery, ...uploadedGallery],
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
    await Promise.all([loadData(), loadStorageStats()]);
    state.editingId = saved.id;
    renderAdminPanel();
    toast("Đã lưu thông tin.");
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
