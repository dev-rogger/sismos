"use client";

import { Suspense, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { marcarLogin } from "../../lib/auth-toast-marker";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modoRegistro, setModoRegistro] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("error")
      ? "No se pudo iniciar sesión con Google. Intentá de nuevo."
      : null,
  );
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      if (modoRegistro) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: nombre || undefined }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? "No se pudo crear la cuenta");
          return;
        }
      }

      marcarLogin();
      const resultado = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (resultado?.error) {
        setError("Email o contraseña incorrectos");
        return;
      }
      router.push("/");
    } catch {
      setError("Ocurrió un error, intentá de nuevo");
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="pantalla-entrada flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-neutral-100">
            {modoRegistro ? "Crear cuenta" : "Iniciar sesión"}
          </h1>
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>
        <p className="mb-5 text-xs text-neutral-400">
          Opcional — sirve para que tus notificaciones no se pierdan al
          cambiar de dispositivo.
        </p>

        <button
          type="button"
          onClick={() => {
            marcarLogin();
            signIn("google", { callbackUrl: "/" });
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.95 11.95 0 0 0 0 12c0 1.92.46 3.74 1.29 5.38l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          Continuar con Google
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-neutral-500">
          <div className="h-px flex-1 bg-neutral-800" />
          o
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          {modoRegistro && (
            <input
              type="text"
              placeholder="Nombre (opcional)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none"
            />
          )}
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={cargando}
            className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-500 bg-sky-500/10 px-3 text-sm font-medium text-sky-400 transition-colors disabled:opacity-50"
          >
            {cargando
              ? "..."
              : modoRegistro
                ? "Crear cuenta"
                : "Iniciar sesión"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setModoRegistro((v) => !v);
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
        >
          {modoRegistro
            ? "¿Ya tenés cuenta? Iniciar sesión"
            : "¿No tenés cuenta? Registrate"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
