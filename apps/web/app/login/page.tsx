"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [modoRegistro, setModoRegistro] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg">
        <h1 className="mb-1 text-lg font-semibold text-neutral-100">
          {modoRegistro ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="mb-5 text-xs text-neutral-400">
          Opcional — sirve para que tus notificaciones no se pierdan al
          cambiar de dispositivo.
        </p>

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600"
        >
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
