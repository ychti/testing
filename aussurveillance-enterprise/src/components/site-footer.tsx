export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} AUSSurveillance Intelligence.</p>
        <p>
          Built for insurers, integrators, and multi-site operators across
          Australia.
        </p>
      </div>
    </footer>
  );
}
