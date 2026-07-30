import test from "node:test";
import assert from "node:assert/strict";
import { PEOPLE } from "../src/config/people.js";
import { canAccessView, isAdminProfile } from "../src/domain/access.js";

const adminProfile = PEOPLE.find((person) => person.id === "edney");
const standardProfile = PEOPLE.find((person) => person.id === "sonia");

test("reconhece Edney como administrador", () => {
  assert.equal(isAdminProfile(adminProfile), true);
  assert.equal(isAdminProfile(standardProfile), false);
});

test("mantém Relatórios disponível somente para o administrador", () => {
  assert.equal(canAccessView(adminProfile, "reports"), true);
  assert.equal(canAccessView(standardProfile, "reports"), false);
});

test("usuários comuns continuam acessando o painel e as páginas pessoais", () => {
  assert.equal(canAccessView(standardProfile, "dashboard"), true);
  PEOPLE.forEach((person) => {
    assert.equal(canAccessView(standardProfile, person.id), true);
  });
  assert.equal(canAccessView(standardProfile, "new"), false);
  assert.equal(canAccessView(standardProfile, "other-accounts"), false);
  assert.equal(canAccessView(standardProfile, "settlement"), false);
  assert.equal(canAccessView(standardProfile, "manage"), false);
  assert.equal(canAccessView(standardProfile, "settings"), false);
});
