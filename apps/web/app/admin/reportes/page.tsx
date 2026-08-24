import Link from "next/link";

export default function AdminReportesPage() {
  return (
    <main className="pantalla-entrada min-h-screen bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <Link
          href="/"
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-lg font-semibold text-neutral-100">Reportes</h1>
      </div>
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center">
        <p className="text-sm text-neutral-500">Próximamente</p>
      </div>
    </main>
  );
}
