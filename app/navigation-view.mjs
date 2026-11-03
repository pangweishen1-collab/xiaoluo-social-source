const views = new Set(["home", "hot", "daily", "analysis", "matrix", "talent", "business"]);

export function viewFromSearch(search) {
  const view = new URLSearchParams(search).get("view");
  return views.has(view) ? view : "home";
}
