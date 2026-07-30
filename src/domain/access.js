import { PEOPLE } from "../config/people.js";

const STANDARD_VIEW_IDS = new Set([
  "dashboard",
  ...PEOPLE.map((person) => person.id),
]);

export function isAdminProfile(profile) {
  return profile?.role === "admin";
}

export function canAccessView(profile, viewId) {
  return isAdminProfile(profile) || STANDARD_VIEW_IDS.has(viewId);
}
