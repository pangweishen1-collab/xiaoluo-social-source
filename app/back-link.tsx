import "./back-link.css";
export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="detail-back-link" href={href}><span aria-hidden="true">←</span>{children}</a>;
}
