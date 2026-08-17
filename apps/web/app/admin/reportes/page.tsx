import Link from "next/link";

export default function AdminReportesPage() {
  return (
    <main className="min-h-screen bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-neutral-100">Reportes</h1>
        <Link
          href="/"
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          ✕
        </Link>
      </div>
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center">
        <p className="text-sm text-neutral-500">Próximamente</p>
      </div>
    </main>
  );
}
