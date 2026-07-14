import assert from "node:assert/strict";
import fs from "node:fs";

let source = fs.readFileSync(new URL("../functions/api/[[path]].js", import.meta.url), "utf8");
source += "\nexport { normalizeAccountRole, normalizePerson, memberEditableIds, memberChanges };";
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

assert.equal(api.normalizeAccountRole("clan_head"), "clan_head");
assert.equal(api.normalizeAccountRole("unknown"), "viewer");

const family = {
  people: [
    { id: "self", spouseIds: ["wife"] },
    { id: "wife", spouseIds: ["self"] },
    { id: "child-a", fatherId: "self", motherId: "wife", spouseIds: ["child-spouse"] },
    { id: "child-spouse", spouseIds: ["child-a"] },
    { id: "child-b", fatherId: "", motherId: "wife" },
    { id: "grandchild", fatherId: "child-a", motherId: "child-spouse" },
    { id: "great-grandchild", fatherId: "grandchild" },
    { id: "sibling", fatherId: "grandfather", motherId: "grandmother" },
  ],
};
const editable = api.memberEditableIds(family, "self");
assert.deepEqual([...editable].sort(), ["child-a", "child-b", "child-spouse", "grandchild", "great-grandchild", "self", "wife"]);
assert.equal(api.memberEditableIds(family, "missing").size, 0);

const normalized = api.normalizePerson({
  fullName: "Nguyễn Văn A",
  graveLocation: "Khu A, hàng 3",
  graveAddress: "Kỳ Văn, Kỳ Anh, Hà Tĩnh",
  graveMapUrl: "https://maps.google.com/example",
  graveNotes: "Lối vào phía đông",
  gravePhoto: "/api/photos/grave-photo",
});
assert.equal(normalized.graveLocation, "Khu A, hàng 3");
assert.equal(normalized.gravePhoto, "/api/photos/grave-photo");

const changes = api.memberChanges(
  { fullName: "Tên cũ", fatherId: "father", spouseIds: ["wife"], job: "Nông dân" },
  { fullName: "Tên mới", fatherId: "other", spouseIds: [], job: "Nông dân" },
);
assert.deepEqual(changes, { fullName: "Tên mới" });

console.log("Account identity and permission regression passed.");
