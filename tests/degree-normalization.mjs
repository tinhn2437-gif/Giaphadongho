import assert from "node:assert/strict";
import fs from "node:fs";

let source = fs.readFileSync(new URL("../functions/api/[[path]].js", import.meta.url), "utf8");
source += "\nexport { normalizedChoiceKey, normalizeEducationLevel, normalizePerson };";

const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const university = "\u0110\u1ea1i h\u1ecdc";
const bachelor = "C\u1eed nh\u00e2n";

assert.equal(api.normalizedChoiceKey(university), "dai hoc");
assert.equal(api.normalizeEducationLevel(university), university);

const person = api.normalizePerson({ fullName: "Test", educationLevel: university });
assert.equal(person.educationLevel, university);
assert.equal(person.academicTitle, bachelor);

assert.throws(
  () => api.normalizePerson({ fullName: "Test", educationLevel: "invalid" }),
  (error) => error?.expose === true && error?.status === 400,
);

console.log("Degree normalization regression passed.");
