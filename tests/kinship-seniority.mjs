import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`, "m"))[0];

const people = [
  { id: "root", fullName: "Root", gender: "Nam", birthDate: "1914", fatherId: "", motherId: "" },
  { id: "older_branch", fullName: "Older branch", gender: "Nam", birthDate: "15/10/1965", fatherId: "root", motherId: "" },
  { id: "younger_branch", fullName: "Younger branch", gender: "Nam", birthDate: "21/12/1970", fatherId: "root", motherId: "" },
  { id: "dat", fullName: "Nguyen Tien Dat", gender: "Nam", birthDate: "27/04/2009", fatherId: "older_branch", motherId: "", spouseIds: ["dat_wife"] },
  { id: "quy", fullName: "Nguyen Van Quy", gender: "Nam", birthDate: "11/07/1993", fatherId: "younger_branch", motherId: "" },
  { id: "dat_wife", fullName: "Dat wife", gender: "Nữ", birthDate: "2008", fatherId: "", motherId: "", spouseIds: ["dat"] },
  { id: "dat_daughter", fullName: "Dat daughter", gender: "Nữ", birthDate: "2035", fatherId: "dat", motherId: "" },
  { id: "quy_son", fullName: "Quy son", gender: "Nam", birthDate: "2018", fatherId: "quy", motherId: "" },
];
const peopleById = new Map(people.map((person) => [person.id, person]));
const personById = (id) => peopleById.get(id) || null;
const birthSortValue = (person) => {
  const years = String(person?.birthDate || "").match(/\d{4}/g);
  return years?.length ? Number(years.at(-1)) * 10000 : Number.MAX_SAFE_INTEGER;
};

const helpers = [
  "siblingKey",
  "ancestorsOf",
  "bloodKinshipTerm",
  "siblingTerm",
  "lineagePathToAncestor",
  "branchChildUnder",
  "lineageBranchComparison",
  "collateralSameGenerationTerm",
].map(extract).join("\n");

const bloodKinshipTerm = new Function(
  "personById",
  "birthSortValue",
  `${helpers}
  function ancestorTerm() { return ""; }
  function descendantTerm() { return ""; }
  function collateralOlderTerm() { return ""; }
  function collateralYoungerTerm() { return ""; }
  return bloodKinshipTerm;`,
)(personById, birthSortValue);

const dat = personById("dat");
const quy = personById("quy");
assert.equal(bloodKinshipTerm(dat, quy), "Em họ");
assert.equal(bloodKinshipTerm(quy, dat), "Anh họ");

const datDaughter = personById("dat_daughter");
const quySon = personById("quy_son");
assert.equal(bloodKinshipTerm(datDaughter, quySon), "Em họ");
assert.equal(bloodKinshipTerm(quySon, datDaughter), "Chị họ");

const kinshipHelpers = ["areSpouses", "kinshipTerm", "inLawTerm"].map(extract).join("\n");
const kinshipTerm = new Function(
  "personById",
  "bloodKinshipTerm",
  `${kinshipHelpers}\nreturn kinshipTerm;`,
)(personById, bloodKinshipTerm);
const datWife = personById("dat_wife");
assert.equal(kinshipTerm(datWife, quy), "Em họ");
assert.equal(kinshipTerm(quy, datWife), "Chị");

console.log("Kinship branch seniority regression passed.");
