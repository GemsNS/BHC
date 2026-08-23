import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-shell">
      <div className="login-panel">
        <p className="login-eyebrow">BHC Intelligence</p>
        <h1 className="login-title">404</h1>
        <p className="login-sub">
          That route is not in the system. Try the overview or use ⌘K to jump
          anywhere.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/dashboard" className="btn-primary">
            Live overview
          </Link>
          <Link href="/admin/sales" className="btn-secondary">
            Sales hub
          </Link>
          <Link href="/apps" className="btn-secondary">
            Field apps
          </Link>
        </div>
      </div>
    </div>
  );
}
