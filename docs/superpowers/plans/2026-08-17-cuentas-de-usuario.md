# Cuentas de usuario (login opcional) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar cuentas de usuario opcionales (Google OAuth + correo/contraseña) a `sismos`, para que las preferencias de notificación push persistan entre dispositivos, sin romper el flujo anónimo que ya existe.

**Architecture:** NextAuth v5 con estrategia de sesión JWT, sin DB adapter — un `signIn` callback manual crea/actualiza la fila en una tabla `users` propia (mismo patrón que `kick-flow`, otro proyecto del autor). `push_subscriptions` gana una columna `user_id` nullable: se popula solo si hay sesión activa al momento de suscribirse; el flujo anónimo actual queda sin cambios.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 (`next-auth@5.0.0-beta.31`, mismo pin que `kick-flow`), `bcryptjs` para hashear contraseñas, Drizzle ORM / Postgres (Neon en producción).

**Spec:** `docs/superpowers/specs/2026-08-17-cuentas-de-usuario-design.md`

## Global Constraints

- El login es **opcional en todo momento** — ninguna funcionalidad existente (incluida activar notificaciones) requiere estar logueado.
- Sin verificación de email en esta fase.
- Sin panel de admin en esta fase — solo se deja el campo `role` disponible en la sesión.
- Sin migración retroactiva de suscripciones push anónimas existentes.
- Sin `apps/web/proxy.ts` en esta fase — no hay ninguna ruta que proteger todavía.
- El bootstrap de admin es vía `ADMIN_EMAIL` (variable de entorno): el usuario cuyo email coincide se promueve a `role: "admin"` en cada login/registro (Google o credentials), sin tocar la base a mano.
- Sin tests automatizados nuevos — no hay lógica pura propia que lo amerite (el hasheo usa `bcryptjs` directo, ya probado). Toda verificación de este plan es manual contra Postgres local, igual que el resto de `packages/db`/`apps/web` en este repo.

---

### Task 1: Schema — tabla `users` y columna `user_id` en `push_subscriptions`

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: migración Drizzle generada en `packages/db/drizzle/`

**Interfaces:**
- Produces: tabla `users` (id, email, name, image, passwordHash, role, timestamps), columna `pushSubscriptions.userId` (nullable, FK a `users.id`) — usados por la Tarea 2 y la Tarea 3.

- [ ] **Paso 1: Agregar la tabla `users`**

En `packages/db/src/schema.ts`, después de `sismosHistoricos` y **antes** de `pushSubscriptions` (el orden importa: `pushSubscriptions` va a referenciar `users.id`, y en JS un `const` no se puede usar antes de declararse en el mismo módulo):

```ts
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Paso 2: Agregar la columna `userId` a `pushSubscriptions`**

Dentro de la definición de columnas de `pushSubscriptions` (junto a `alcanceMundial`, antes de `createdAt`):

```ts
userId: text("user_id").references(() => users.id),
```

- [ ] **Paso 3: Generar y aplicar la migración**

Asegurarse que Postgres local está arriba: `docker compose up -d postgres` (desde la raíz del repo).

Run: `cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm run db:generate`
Expected: crea un archivo nuevo en `packages/db/drizzle/` con `CREATE TABLE "users" (...)` y `ALTER TABLE "push_subscriptions" ADD COLUMN "user_id" text;` (más el `ADD CONSTRAINT` del FK).

Run: `cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm run db:migrate`
Expected: termina sin error. Verificar con:

```bash
docker exec -it $(docker compose ps -q postgres) psql -U postgres -d sismos -c "\d users" -c "\d push_subscriptions"
```

Debe mostrar la tabla `users` completa y la columna `user_id` en `push_subscriptions`.

- [ ] **Paso 4: Verificar tipos**

Run: `cd packages/db && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat(db): agregar tabla users y columna user_id a push_subscriptions"
```

---

### Task 2: Queries de usuarios

**Files:**
- Create: `packages/db/src/queries/user.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: tabla `users` (Tarea 1).
- Produces: `User` (tipo), `findUserByEmail(email): Promise<User | null>`, `createUserConPassword({ email, passwordHash, name? }): Promise<User>`, `upsertUsuarioGoogle({ email, name?, image? }): Promise<User>` — usados por `apps/web/lib/auth.ts` (Tarea 4) y `apps/web/app/api/auth/register/route.ts` (Tarea 5).

- [ ] **Paso 1: Implementar las queries**

Crear `packages/db/src/queries/user.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../connection";
import { users } from "../schema";

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    passwordHash: row.passwordHash,
    role: row.role as "user" | "admin",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rolParaEmail(email: string): "user" | "admin" {
  return email === process.env.ADMIN_EMAIL ? "admin" : "user";
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email));
  return row ? toUser(row) : null;
}

export async function createUserConPassword(input: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<User> {
  const [row] = await getDb()
    .insert(users)
    .values({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      role: rolParaEmail(input.email),
    })
    .returning();
  if (!row) {
    throw new Error(
      "createUserConPassword: insert returned no row unexpectedly",
    );
  }
  return toUser(row);
}

export async function upsertUsuarioGoogle(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<User> {
  const existente = await findUserByEmail(input.email);
  const now = new Date();

  if (!existente) {
    const [row] = await getDb()
      .insert(users)
      .values({
        email: input.email,
        name: input.name ?? null,
        image: input.image ?? null,
        role: rolParaEmail(input.email),
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new Error(
        "upsertUsuarioGoogle: insert returned no row unexpectedly",
      );
    }
    return toUser(row);
  }

  const [row] = await getDb()
    .update(users)
    .set({
      name: input.name ?? existente.name,
      image: input.image ?? existente.image,
      role: rolParaEmail(input.email),
      updatedAt: now,
    })
    .where(eq(users.email, input.email))
    .returning();
  if (!row) {
    throw new Error(
      "upsertUsuarioGoogle: update returned no row unexpectedly",
    );
  }
  return toUser(row);
}
```

- [ ] **Paso 2: Exportar el módulo nuevo**

En `packages/db/src/index.ts`, agregar:

```ts
export * from "./queries/user";
```

- [ ] **Paso 3: Verificar tipos**

Run: `cd packages/db && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 4: Verificación manual contra Postgres local**

Con Postgres local arriba y migrado (Tarea 1), desde `packages/db`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { createUserConPassword, findUserByEmail, upsertUsuarioGoogle } from "./src/index.ts";

const u1 = await createUserConPassword({ email: "test-plan@example.com", passwordHash: "hash-fake", name: "Test" });
console.log("creado:", u1.id, u1.email, u1.role);

const encontrado = await findUserByEmail("test-plan@example.com");
console.log("encontrado:", encontrado?.id === u1.id);

const u2 = await upsertUsuarioGoogle({ email: "test-plan-google@example.com", name: "Google Test", image: "https://example.com/a.png" });
console.log("google creado:", u2.id, u2.email, u2.role);

const u2b = await upsertUsuarioGoogle({ email: "test-plan-google@example.com", name: "Google Test Actualizado" });
console.log("google actualizado (mismo id):", u2b.id === u2.id, u2b.name);

process.exit(0);
'
```

Expected: `creado:` con un id y role `user`; `encontrado: true`; `google creado:` con role `user`; `google actualizado (mismo id): true Google Test Actualizado`.

Limpiar los datos de prueba:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { getDb } from "./src/connection.ts";
import { users } from "./src/schema.ts";
import { inArray } from "drizzle-orm";
await getDb().delete(users).where(inArray(users.email, ["test-plan@example.com", "test-plan-google@example.com"]));
console.log("limpiado");
process.exit(0);
'
```

- [ ] **Paso 5: Commit**

```bash
git add packages/db/src/queries/user.ts packages/db/src/index.ts
git commit -m "feat(db): queries para crear/buscar usuarios (password y Google)"
```

---

### Task 3: Propagar `userId` en las queries de suscripciones push

**Files:**
- Modify: `packages/db/src/queries/push-subscription.ts`

**Interfaces:**
- Consumes: columna `pushSubscriptions.userId` (Tarea 1).
- Produces: `PushSubscription.userId: string | null`, `SuscripcionInput.userId?: string | null` — usado por `apps/web/lib/push-subscriptions.ts` (Tarea 9).

- [ ] **Paso 1: Agregar `userId` a los tipos**

En `packages/db/src/queries/push-subscription.ts`, agregar `userId: string | null;` a la interfaz `PushSubscription` (después de `alcanceMundial`), y `userId?: string | null;` a `SuscripcionInput` (después de `alcanceMundial`).

- [ ] **Paso 2: Propagar en `toPushSubscription`**

Agregar `userId: row.userId,` al objeto que devuelve `toPushSubscription`.

- [ ] **Paso 3: Propagar en `upsertPushSubscription`**

Agregar `userId: input.userId ?? null,` tanto al objeto de `.values({...})` como al de `.set({...})` dentro de `upsertPushSubscription` (junto a `alcanceMundial`).

- [ ] **Paso 4: Verificar tipos**

Run: `cd packages/db && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add packages/db/src/queries/push-subscription.ts
git commit -m "feat(db): propagar userId opcional en suscripciones push"
```

---

### Task 4: Configuración de NextAuth

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/lib/auth.config.ts`
- Create: `apps/web/lib/auth.ts`

**Interfaces:**
- Consumes: `findUserByEmail`, `upsertUsuarioGoogle` (Tarea 2).
- Produces: `handlers`, `auth`, `signIn`, `signOut` exportados de `apps/web/lib/auth.ts` — usados por la Tarea 5, la Tarea 8 y la Tarea 9. `session.user.id`/`session.user.role` tipados vía `declare module "next-auth"`.

- [ ] **Paso 1: Instalar dependencias**

Run: `pnpm add next-auth@5.0.0-beta.31 bcryptjs --filter web`
Run: `pnpm add -D @types/bcryptjs --filter web`

- [ ] **Paso 2: Crear `auth.config.ts`**

Crear `apps/web/lib/auth.config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "user" | "admin";
      return session;
    },
  },
  session: { strategy: "jwt" },
  providers: [],
};
```

- [ ] **Paso 3: Crear `auth.ts`**

Crear `apps/web/lib/auth.ts`:

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { findUserByEmail, upsertUsuarioGoogle } from "@sismos/db";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role?: "user" | "admin";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = (credentials.email as string).toLowerCase();
        const user = await findUserByEmail(email);
        if (!user || !user.passwordHash) return null;
        const esValida = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!esValida) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const dbUser = await upsertUsuarioGoogle({
          email: user.email!,
          name: user.name,
          image: user.image,
        });
        user.id = dbUser.id;
        user.role = dbUser.role;
      }
      return true;
    },
  },
});
```

- [ ] **Paso 4: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores. (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no necesitan tener un valor real para que esto compile — recién hacen falta para probar el login con Google de verdad, más adelante.)

- [ ] **Paso 5: Commit**

```bash
git add apps/web/package.json apps/web/lib/auth.config.ts apps/web/lib/auth.ts pnpm-lock.yaml
git commit -m "feat(web): configurar NextAuth (Google + credentials, sesión JWT)"
```

---

### Task 5: Rutas de API — NextAuth handler y registro

**Files:**
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/app/api/auth/register/route.ts`

**Interfaces:**
- Consumes: `handlers` (Tarea 4, vía `../../../../lib/auth`), `findUserByEmail`/`createUserConPassword` (Tarea 2).
- Produces: endpoint `POST /api/auth/register` — usado por `apps/web/app/login/page.tsx` (Tarea 6).

- [ ] **Paso 1: Handler de NextAuth**

Crear `apps/web/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "../../../../lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Paso 2: Endpoint de registro**

Crear `apps/web/app/api/auth/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUserConPassword } from "@sismos/db";

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 400 },
    );
  }

  try {
    const existente = await findUserByEmail(email);
    if (existente) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email" },
        { status: 409 },
      );
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await createUserConPassword({
      email,
      passwordHash,
      name: body.name ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/auth/register] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Paso 3: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/app/api/auth
git commit -m "feat(web): endpoints de NextAuth y registro por correo"
```

---

### Task 6: Pantalla de login/registro

**Files:**
- Create: `apps/web/app/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register` (Tarea 5), `signIn` de `next-auth/react` (paquete instalado en Tarea 4).

- [ ] **Paso 1: Implementar la pantalla**

Crear `apps/web/app/login/page.tsx`:

```tsx
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

    if (modoRegistro) {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: nombre || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "No se pudo crear la cuenta");
        setCargando(false);
        return;
      }
    }

    const resultado = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setCargando(false);
    if (resultado?.error) {
      setError("Email o contraseña incorrectos");
      return;
    }
    router.push("/");
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
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add apps/web/app/login
git commit -m "feat(web): pantalla de login/registro"
```

---

### Task 7: `SessionProvider` en el layout raíz

**Files:**
- Create: `apps/web/components/SessionProviderWrapper.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: contexto de `useSession()` disponible en toda la app — usado por la Tarea 8.

- [ ] **Paso 1: Crear el wrapper cliente**

`apps/web/app/layout.tsx` es un Server Component; `SessionProvider` de `next-auth/react` necesita ser cliente. Crear `apps/web/components/SessionProviderWrapper.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Paso 2: Envolver el layout**

En `apps/web/app/layout.tsx`, agregar el import:

```ts
import SessionProviderWrapper from "../components/SessionProviderWrapper";
```

Y cambiar:

```tsx
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
```

por:

```tsx
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
```

- [ ] **Paso 3: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/components/SessionProviderWrapper.tsx apps/web/app/layout.tsx
git commit -m "feat(web): envolver la app en SessionProvider de NextAuth"
```

---

### Task 8: Ítem de login/logout en el menú lateral

**Files:**
- Modify: `apps/web/components/menu/MenuLateral.tsx`

**Interfaces:**
- Consumes: `useSession`, `signOut` de `next-auth/react` (Tarea 4/7).

- [ ] **Paso 1: Agregar el ícono**

En `apps/web/components/menu/MenuLateral.tsx`, después de `IconoCompartir` (y antes de `const MENSAJE_COMPARTIR`), agregar:

```tsx
function IconoUsuario() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
```

- [ ] **Paso 2: Agregar los imports**

Al principio del archivo, junto a los imports existentes:

```ts
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
```

- [ ] **Paso 3: Usar la sesión dentro del componente**

Dentro de `export default function MenuLateral({...}) {`, junto a los `useState` existentes, agregar:

```ts
const router = useRouter();
const { data: session } = useSession();
```

- [ ] **Paso 4: Agregar el botón al menú**

Después del botón de "Compartir" (`{enlaceCopiado ? "Enlace copiado" : "Compartir"}`) y antes de `{puedeInstalarApp && (`, agregar:

```tsx
          {session ? (
            <button
              type="button"
              onClick={() => elegir(() => signOut({ callbackUrl: "/" }))}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoUsuario />
              Cerrar sesión ({session.user?.name ?? session.user?.email})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => elegir(() => router.push("/login"))}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoUsuario />
              Iniciar sesión
            </button>
          )}
```

- [ ] **Paso 5: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add apps/web/components/menu/MenuLateral.tsx
git commit -m "feat(web): ítem de login/logout en el menú lateral"
```

---

### Task 9: Atar `userId` al suscribirse a notificaciones estando logueado

**Files:**
- Modify: `apps/web/lib/push-subscriptions.ts`
- Modify: `apps/web/app/api/push/subscribe/route.ts`

**Interfaces:**
- Consumes: `auth()` (Tarea 4), `SuscripcionInput.userId` (Tarea 3).

- [ ] **Paso 1: Propagar `userId` en el wrapper**

En `apps/web/lib/push-subscriptions.ts`, agregar `userId?: string | null;` a `GuardarSuscripcionInput`, y pasarlo tal cual a `upsertPushSubscription` (ya lo hace por spread — `return upsertPushSubscription(input);` — así que con solo agregar el campo al tipo alcanza, no hace falta tocar el cuerpo de la función).

- [ ] **Paso 2: Leer la sesión en el endpoint**

En `apps/web/app/api/push/subscribe/route.ts`, agregar el import:

```ts
import { auth } from "../../../../lib/auth";
```

Dentro de `POST`, antes del `try { await guardarSuscripcion({...`, agregar:

```ts
const session = await auth();
```

Y agregar `userId: session?.user?.id ?? null,` al objeto que se pasa a `guardarSuscripcion` (junto a `alcanceMundial`).

- [ ] **Paso 3: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/lib/push-subscriptions.ts apps/web/app/api/push/subscribe/route.ts
git commit -m "feat(web): atar user_id a la suscripción push si hay sesión activa"
```

---

### Task 10: Verificación manual end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Paso 1: Lint y tipos en todo el monorepo**

Run (desde la raíz): `pnpm run lint && pnpm run check-types`
Expected: sin errores en ningún paquete.

- [ ] **Paso 2: Preparar variables de entorno locales**

En `apps/web/.env.local`, agregar (si no están):

```
AUTH_SECRET=<generar con: npx auth secret, o openssl rand -base64 33>
ADMIN_EMAIL=<tu email, para probar el bootstrap de admin>
```

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` quedan pendientes hasta que existan credenciales reales de Google Cloud Console — sin ellas, el botón "Continuar con Google" va a fallar al tocarlo, pero el resto de la app (incluido el login por correo/contraseña) funciona igual.

- [ ] **Paso 3: Levantar el frontend local**

Con Postgres local arriba y migrado: `cd apps/web && pnpm exec next dev --webpack -p 3050`

- [ ] **Paso 4: Probar registro por correo**

En el navegador, ir a `http://localhost:3050/login`, registrarse con el email puesto en `ADMIN_EMAIL` del Paso 2. Confirmar que redirige a `/` logueado (el menú lateral muestra "Cerrar sesión (...)")."

Verificar en la base que el rol quedó en `admin`:

```bash
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { findUserByEmail } from "./src/index.ts";
const u = await findUserByEmail(process.env.ADMIN_EMAIL_TEST ?? "PONER_EL_MISMO_EMAIL_DEL_PASO_4");
console.log(u);
process.exit(0);
'
```

Expected: `role: "admin"`.

- [ ] **Paso 5: Probar logout y login**

Cerrar sesión desde el menú, confirmar que vuelve a mostrar "Iniciar sesión". Loguearse de nuevo con el mismo correo/contraseña desde `/login`, confirmar que entra.

- [ ] **Paso 6: Probar que la suscripción push queda atada al usuario**

Logueado, abrir el menú → Notificaciones → Activar. Confirmar en la base:

```bash
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { getDb } from "./src/connection.ts";
import { pushSubscriptions } from "./src/schema.ts";
import { desc } from "drizzle-orm";
const [ultima] = await getDb().select().from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt)).limit(1);
console.log("user_id:", ultima?.userId);
process.exit(0);
'
```

Expected: `user_id` no nulo, coincide con el id del usuario logueado.

- [ ] **Paso 7: Limpiar los datos de prueba**

```bash
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { getDb } from "./src/connection.ts";
import { users, pushSubscriptions } from "./src/schema.ts";
import { eq } from "drizzle-orm";
const email = "PONER_EL_MISMO_EMAIL_DEL_PASO_4";
const [u] = await getDb().select().from(users).where(eq(users.email, email));
if (u) {
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.userId, u.id));
  await getDb().delete(users).where(eq(users.id, u.id));
}
console.log("limpiado");
process.exit(0);
'
```

- [ ] **Paso 8: Apagar el entorno local**

```bash
docker compose down
```

Este es el único paso del plan que no termina en un commit — es verificación, no cambia código.

## Pendiente fuera de este plan (bootstrapping manual de Rodrigo)

- Crear credenciales OAuth en Google Cloud Console (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) y cargarlas en Vercel para poder probar el login con Google en producción — el código queda listo, pero no se puede verificar en vivo sin esto.
- Cargar `AUTH_SECRET` y `ADMIN_EMAIL` en Vercel (producción) antes de deployar, igual que se hizo en local.
- **Correr la migración de Drizzle contra Neon (producción) ANTES de deployar el código de esta rama.** La migración agrega la tabla `users` y la columna `push_subscriptions.user_id`. El código nuevo de `POST /api/push/subscribe` pasa `userId` incondicionalmente en cada insert/update — si el código se deploya antes de migrar, **cualquier suscripción push (incluidas las anónimas)** falla con un 500, no solo el login. Orden correcto: 1) correr `drizzle-kit migrate` contra `DATABASE_URL` (o `DATABASE_URL_UNPOOLED`, según cuál use el script de migración) de producción, 2) recién ahí deployar `sismos-web`.
- Cargar las mismas 4 variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ADMIN_EMAIL`) en el proyecto Vercel `sismos-web` (ya hecho en este caso, ver notas de la conversación — pero dejarlo escrito acá para la próxima vez que alguien lea este plan).
