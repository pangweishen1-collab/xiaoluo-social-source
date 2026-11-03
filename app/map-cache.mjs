import { mapShapes } from "./company-geography.mjs";
let pending;
export function loadCompanyMap() {
  return pending ??= fetch("/china-provinces.json")
    .then(response => { if (!response.ok) throw new Error("Map unavailable"); return response.json(); })
    .then(mapShapes)
    .catch(error => { pending = undefined; throw error; });
}
