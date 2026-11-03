export type BusinessTypeIconName = "registration" | "publishing" | "payment" | "games" | "gifts" | "growth";

export default function BusinessTypeIcon({ name }: { name: BusinessTypeIconName }) {
  const paths = {
    registration: <><path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01M3 21h18"/></>,
    publishing: <><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18h4M12 14V7m0 0-3 3m3-3 3 3"/></>,
    payment: <><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9h19M6 15h4M16.5 13v4m-2-2h4"/></>,
    games: <><path d="M7.5 8h9a4 4 0 0 1 3.9 3.1l1 4.6a2.2 2.2 0 0 1-3.5 2.2L15 15.5H9l-2.9 2.4a2.2 2.2 0 0 1-3.5-2.2l1-4.6A4 4 0 0 1 7.5 8Z"/><path d="M7 11v4m-2-2h4M16.5 11.5h.01M18.5 13.5h.01"/></>,
    gifts: <><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M2 7h20v3H2zM12 7v14M12 7C7 7 5.5 5.7 6.2 3.7 7 1.3 11 3.2 12 7Zm0 0c5 0 6.5-1.3 5.8-3.3C17 1.3 13 3.2 12 7Z"/></>,
    growth: <><path d="M3 20h18M5 17v-5h3v5M11 17V9h3v8M17 17V5h3v12M4 8l5-4 4 2 6-4"/></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
