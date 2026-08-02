import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/platform", label: "Platform" },
  { href: "/methodology", label: "Methodology" },
  { href: "/trust", label: "Trust" },
  { href: "/api", label: "API" },
];

export function HeaderNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/20 text-sm font-semibold text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.45)]">
            AU
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-100">
              AUSSurveillance Intel
            </p>
            <p className="text-xs text-slate-400">Physical security intelligence</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
