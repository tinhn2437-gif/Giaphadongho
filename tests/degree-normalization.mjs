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
assert.equal(person.academicDegree, bachelor);
assert.equal(person.academicRank, "");
assert.equal(person.academicTitle, bachelor);

const professor = api.normalizePerson({
  fullName: "Professor",
  educationLevel: university,
  academicDegree: "Ti\u1ebfn s\u0129",
  academicRank: "PGS",
});
assert.equal(professor.academicRank, "PGS");
assert.equal(professor.academicDegree, "Ti\u1ebfn s\u0129");
assert.equal(professor.academicTitle, "PGS");

const legacyDoctor = api.normalizePerson({ fullName: "Legacy", academicTitle: "Ti\u1ebfn s\u0129" });
assert.equal(legacyDoctor.academicDegree, "Ti\u1ebfn s\u0129");
assert.equal(legacyDoctor.academicRank, "");

const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const degreeHelper = appSource.match(/function academicDegreeFor\(person\) \{[\s\S]*?\n\}/)[0];
const rankHelper = appSource.match(/function academicRankFor\(person\) \{[\s\S]*?\n\}/)[0];
const displayHelper = appSource.match(/function academicDisplay\(person\) \{[\s\S]*?\n\}/)[0];
const { academicDisplay } = new Function(
  `${degreeHelper}\n${rankHelper}\n${displayHelper}\nreturn { academicDisplay };`,
)();
assert.equal(
  academicDisplay({ academicRank: "PGS", academicDegree: "Ti\u1ebfn s\u0129" }),
  "PGS \u00b7 Ti\u1ebfn s\u0129",
);

const educationFormHelper = appSource.match(/function updateEducationFields\(\) \{[\s\S]*?\n\}/)[0];
let form = {
  elements: {
    educationLevel: { value: university },
    academicDegree: { value: "" },
  },
};
const updateEducationFields = new Function(
  "$",
  `${educationFormHelper}\nreturn updateEducationFields;`,
)(() => form);
updateEducationFields();
assert.equal(form.elements.academicDegree.value, bachelor);

assert.throws(
  () => api.normalizePerson({ fullName: "Test", educationLevel: "invalid" }),
  (error) => error?.expose === true && error?.status === 400,
);

console.log("Degree normalization regression passed.");
