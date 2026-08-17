# Panel de admin — submenú y listado de usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un ítem "Admin" al menú lateral (visible solo para `role: "admin"`) que despliega un submenú con "Usuarios" (tabla de usuarios registrados) y "Reportes" (placeholder "Próximamente", funcionalidad real queda para más adelante).

**Architecture:** Primer árbol de rutas protegidas de la app (`/admin/**`), protegido con un `app/admin/layout.tsx` (Server Component) que llama `auth()` y redirige a `/` si no hay sesión o el rol no es `admin` — sin `proxy.ts`, que solo se justificaría con múltiples árboles protegidos o necesidad de lógica compartida en el edge. `packages/db` gana una query de solo lectura (`listUsers`) sin paginación, dado el volumen bajo de usuarios hoy.

**Tech Stack:** Next.js 16 (App Router, Server Components), NextAuth v5 (`auth()` ya existente de `apps/web/lib/auth.ts`), Drizzle ORM / Postgres (Neon en producción).

**Spec:** No hay spec formal — este plan nace de una conversación de brainstorming acotada (bounded) directamente con el usuario, sobre código ya existente de la feature de cuentas de usuario (`docs/superpowers/specs/2026-08-17-cuentas-de-usuario-design.md`), que dejó explícitamente el panel de admin fuera de su alcance pero con `session.user.role` ya listo para usarse.

## Global Constraints

- Todas las rutas bajo `/admin/**` requieren sesión con `role === "admin"`; sin sesión o con `role !== "admin"`, redirige a `/`.
- Sin `apps/web/proxy.ts` en esta fase — la protección vía `app/admin/layout.tsx` alcanza para un solo árbol de rutas protegidas.
- Sin paginación en `listUsers` en esta fase — el volumen de usuarios registrados es bajo.
- `/admin/reportes` es un placeholder estático ("Próximamente") sin funcionalidad real en esta fase.
- Sin tests automatizados nuevos — mismo criterio que el resto de `packages/db`/`apps/web` en este repo (sin infraestructura de test para código que toca DB, se verifica manualmente).

---

### Task 1: Query `listUsers` en `packages/db`

**Files:**
- Modify: `packages/db/src/queries/user.ts`

**Interfaces:**
- Consumes: tabla `users`, tipo `User`, función `toUser` (ya existentes en este archivo).
- Produces: `listUsers(): Promise<User[]>` — usado por la Tarea 3.

- [ ] **Paso 1: Agregar `listUsers`**

En `packages/db/src/queries/user.ts`, cambiar el import de `drizzle-orm` en la línea 1 de:

```ts
import { eq } from "drizzle-orm";
```

a:

```ts
import { desc, eq } from "drizzle-orm";
```

Y agregar, al final del archivo (después de `upsertUsuarioGoogle`):

```ts

export async function listUsers(): Promise<User[]> {
  const rows = await getDb()
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));
  return rows.map(toUser);
}
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd packages/db && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 3: Verificación manual contra Postgres local**

Con Postgres local arriba (`docker compose up -d postgres` desde la raíz del repo) y migrado, desde `packages/db`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { listUsers, createUserConPassword } from "./src/index.ts";

const antes = await listUsers();
console.log("usuarios antes:", antes.length);

const u = await createUserConPassword({ email: "test-listusers@example.com", passwordHash: "hash-fake", name: "Test List" });
console.log("creado:", u.id);

const despues = await listUsers();
console.log("usuarios despues:", despues.length, "esperado:", antes.length + 1);
console.log("orden desc (el nuevo debe ser el primero):", despues[0]?.id === u.id);

process.exit(0);
'
```

Expected: `usuarios despues` = `antes + 1`, y `orden desc (...): true`.

Limpiar el dato de prueba:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { getDb } from "./src/connection.ts";
import { users } from "./src/schema.ts";
import { eq } from "drizzle-orm";
await getDb().delete(users).where(eq(users.email, "test-listusers@example.com"));
console.log("limpiado");
process.exit(0);
'
```

- [ ] **Paso 4: Commit**

```bash
git add packages/db/src/queries/user.ts
git commit -m "feat(db): agregar listUsers para el panel de admin"
```

---

### Task 2: Layout protegido `/admin/**`

**Files:**
- Create: `apps/web/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `auth` exportado de `apps/web/lib/auth.ts` (ya existente).
- Produces: protección de sesión+rol para toda ruta bajo `apps/web/app/admin/**` — usado implícitamente por las Tareas 3 y 4 (cualquier `page.tsx` dentro de `app/admin/` queda protegido automáticamente por este layout, sin que esas páginas necesiten repetir el chequeo).

- [ ] **Paso 1: Crear el layout**

Crear `apps/web/app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    redirect("/");
  }
  return <>{children}</>;
}
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores. (Todavía no hay ningún `page.tsx` bajo `app/admin/`, así que este layout por sí solo no es una ruta navegable hasta la Tarea 3 — eso es esperado.)

- [ ] **Paso 3: Commit**

```bash
git add apps/web/app/admin/layout.tsx
git commit -m "feat(web): proteger /admin con sesión + rol admin"
```

---

### Task 3: Página `/admin/usuarios`

**Files:**
- Create: `apps/web/app/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `listUsers` (Tarea 1), protección del layout (Tarea 2).

- [ ] **Paso 1: Crear la página**

Crear `apps/web/app/admin/usuarios/page.tsx`:

```tsx
import { listUsers } from "@sismos/db";

export default async function AdminUsuariosPage() {
  const usuarios = await listUsers();

  return (
    <main className="min-h-screen bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-lg font-semibold text-neutral-100">
          Usuarios registrados
        </h1>

        {usuarios.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin usuarios registrados</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-400">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-b border-neutral-800 bg-neutral-950 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-neutral-100">
                      {usuario.email}
                    </td>
                    <td className="px-3 py-2 text-neutral-300">
                      {usuario.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-300">
                      {usuario.role}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {usuario.createdAt.toLocaleDateString("es-CL")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
git add apps/web/app/admin/usuarios
git commit -m "feat(web): página /admin/usuarios con listado de usuarios"
```

---

### Task 4: Página `/admin/reportes` (placeholder)

**Files:**
- Create: `apps/web/app/admin/reportes/page.tsx`

**Interfaces:**
- Consumes: protección del layout (Tarea 2). Ninguna otra dependencia.

- [ ] **Paso 1: Crear la página**

Crear `apps/web/app/admin/reportes/page.tsx`:

```tsx
export default function AdminReportesPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="text-center">
        <h1 className="mb-2 text-lg font-semibold text-neutral-100">
          Reportes
        </h1>
        <p className="text-sm text-neutral-500">Próximamente</p>
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
git add apps/web/app/admin/reportes
git commit -m "feat(web): página /admin/reportes (placeholder)"
```

---

### Task 5: Submenú "Admin" en el menú lateral

**Files:**
- Modify: `apps/web/components/menu/MenuLateral.tsx`

**Interfaces:**
- Consumes: `session.user.role` (ya disponible vía `useSession()`, que este componente ya usa), rutas `/admin/usuarios` y `/admin/reportes` (Tareas 3 y 4).

- [ ] **Paso 1: Agregar el ícono de Admin**

En `apps/web/components/menu/MenuLateral.tsx`, después de la función `IconoUsuario` (y antes de `const MENSAJE_COMPARTIR`), agregar:

```tsx
function IconoAdmin() {
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
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}
```

- [ ] **Paso 2: Agregar el estado del submenú**

Dentro de `export default function MenuLateral({...}) {`, junto a los `useState` existentes (después de `const [enlaceCopiado, setEnlaceCopiado] = useState(false);`), agregar:

```ts
const [adminAbierto, setAdminAbierto] = useState(false);
```

- [ ] **Paso 3: Agregar el ítem "Admin" con submenú**

Después del bloque `{session ? (...) : (...)}` del login/logout (líneas ~262-280 del archivo actual) y antes de `{puedeInstalarApp && (`, agregar:

```tsx
          {session?.user?.role === "admin" && (
            <div>
              <button
                type="button"
                onClick={() => setAdminAbierto((v) => !v)}
                aria-expanded={adminAbierto}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
              >
                <IconoAdmin />
                Admin
                <span
                  className={`ml-auto text-neutral-500 transition-transform duration-150 ${
                    adminAbierto ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
              {adminAbierto && (
                <div className="flex flex-col gap-1 pl-9">
                  <button
                    type="button"
                    onClick={() => elegir(() => router.push("/admin/usuarios"))}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:bg-neutral-800"
                  >
                    Usuarios
                  </button>
                  <button
                    type="button"
                    onClick={() => elegir(() => router.push("/admin/reportes"))}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:bg-neutral-800"
                  >
                    Reportes
                  </button>
                </div>
              )}
            </div>
          )}
```

Nota: `router` y `elegir` ya existen en este componente (se usan en el ítem de login/logout), no hace falta agregarlos.

- [ ] **Paso 4: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add apps/web/components/menu/MenuLateral.tsx
git commit -m "feat(web): submenú Admin (Usuarios/Reportes) en el menú lateral"
```

---

### Task 6: Verificación manual end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Paso 1: Lint y tipos en todo el monorepo**

Run (desde la raíz): `pnpm run lint && pnpm run check-types`
Expected: sin errores en ningún paquete.

- [ ] **Paso 2: Levantar el frontend local**

Con Postgres local arriba y migrado: `cd apps/web && pnpm exec next dev --webpack -p 3050`

- [ ] **Paso 3: Probar como admin**

Loguearse con el email configurado en `ADMIN_EMAIL` (local, vía `/login`). Abrir el menú lateral y confirmar:
- Aparece el ítem "Admin" con flecha.
- Al tocarlo, se despliega el submenú con "Usuarios" y "Reportes", la flecha rota.
- Tocar "Usuarios" navega a `/admin/usuarios` y muestra una tabla con al menos el usuario admin logueado.
- Tocar "Reportes" navega a `/admin/reportes` y muestra "Próximamente".

- [ ] **Paso 4: Probar como no-admin**

Registrar/loguearse con un email distinto de `ADMIN_EMAIL`. Confirmar:
- El ítem "Admin" NO aparece en el menú.
- Navegar manualmente a `http://localhost:3050/admin/usuarios` redirige a `/`.

- [ ] **Paso 5: Probar sin sesión**

Cerrar sesión. Navegar manualmente a `http://localhost:3050/admin/usuarios` redirige a `/`.

- [ ] **Paso 6: Apagar el entorno local**

```bash
docker compose down
```

Este es el único paso del plan que no termina en un commit — es verificación, no cambia código.
