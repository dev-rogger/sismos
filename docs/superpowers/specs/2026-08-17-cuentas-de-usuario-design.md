# Cuentas de usuario (login opcional) — design

## Propósito

`sismos` hoy no tiene sistema de usuarios — las suscripciones push son anónimas, atadas al navegador, y se pierden al cambiar de dispositivo o al desactivar/reactivar notificaciones (confirmado en la práctica: el `endpoint` cambia cada vez). Este spec agrega cuentas de usuario **opcionales** para:

1. Que las preferencias de notificación persistan entre dispositivos si el usuario se loguea.
2. Sentar la base de un rol `admin` real (hoy la alerta de caída de CSN es un hack de variables de entorno apuntando a una sola suscripción push).

Decisiones de scope (de la conversación de brainstorming):
- **Login opcional, nunca obligatorio.** Las notificaciones anónimas siguen funcionando exactamente igual que hoy si el usuario no se loguea — no se le pone una pared de registro a la feature de seguridad más importante de la app.
- Dos formas de entrar: **Google OAuth** y **correo + contraseña**, sin verificación de email por ahora (la app no tiene proveedor de correo configurado; agregar uno queda fuera de este spec).
- Se usa el mismo patrón que ya usa `kick-flow` (otro proyecto de Rodrigo, también NextAuth v5): **JWT de sesión, sin DB adapter**, con un `signIn` callback manual que crea/actualiza el usuario en la tabla propia — no las tablas `accounts`/`sessions`/`verification_tokens` que trae el adapter oficial de Drizzle. Más simple y consistente con lo que ya conoce.
- Bootstrap de admin: un email fijo en variable de entorno (`ADMIN_EMAIL`) se auto-promueve a `role: "admin"` en su primer login, sin tocar la base a mano.
- Fuera de alcance explícito para este spec (todo para después, en sus propios specs):
  - El panel/pantalla de admin en sí — solo se deja el campo `role` en la sesión, listo para usarlo.
  - Verificación de email.
  - Migrar retroactivamente las suscripciones push anónimas que ya existen a una cuenta.
  - Comentarios / funciones sociales por sismo.
  - `apps/web/proxy.ts` para proteger rutas — no hace falta todavía porque no hay ninguna ruta que requiera estar logueado en esta primera vuelta; se agrega cuando exista el panel de admin.

## Modelo de datos

Nueva tabla en `packages/db/src/schema.ts`, mismo patrón de columnas planas que el resto del schema:

```ts
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"), // null si entró solo por Google
  role: text("role").notNull().default("user"), // "user" | "admin"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

`push_subscriptions` gana una columna nueva:

```ts
userId: text("user_id").references(() => users.id),
```

Nullable — `null` para suscripciones anónimas (el caso de hoy), poblada solo cuando alguien activa notificaciones estando logueado.

**`packages/db/src/queries/user.ts`** (nuevo):
- `findUserByEmail(email: string): Promise<User | null>`
- `createUserConPassword({ email, passwordHash, name }): Promise<User>`
- `upsertUsuarioGoogle({ email, name, image }): Promise<User>` — busca por email; si no existe lo crea (`passwordHash: null`); si existe, actualiza `name`/`image` si vinieron nuevos. En ambos casos, si `email === process.env.ADMIN_EMAIL` fuerza `role: "admin"`.

## Backend — NextAuth

Mismo split de archivos que `kick-flow`:

**`apps/web/lib/auth.config.ts`** (nuevo): config base sin providers (para poder importarla en el `proxy.ts` del futuro panel de admin sin traer las dependencias de los providers) — `pages: { signIn: "/login", error: "/login" }`, callbacks `jwt`/`session` que propagan `id` y `role` al token/sesión, `session: { strategy: "jwt" }`.

**`apps/web/lib/auth.ts`** (nuevo): `NextAuth({ ...authConfig, providers: [...] })` con:
- `Google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })`
- `Credentials({...})` con `authorize()`: busca el usuario por email vía `findUserByEmail`, si no existe o no tiene `passwordHash` (entró por Google) devuelve `null`, si existe compara con `bcrypt.compare(password, user.passwordHash)`.
- Callback `signIn`: si `account.provider === "google"`, llama `upsertUsuarioGoogle` y pisa `user.id`/`user.role` con lo que devuelve.

Tipos de `next-auth` extendidos (`declare module "next-auth"`) para que `session.user.id` y `session.user.role` existan con tipos, igual que en kick-flow.

**`apps/web/app/api/auth/[...nextauth]/route.ts`** (nuevo): `export const { GET, POST } = handlers;` re-exportado de `lib/auth.ts`.

**Registro por correo** — `apps/web/app/api/auth/register/route.ts` (nuevo, NextAuth no trae esto de fábrica): `POST { email, password, name }` → valida que el email no exista, hashea con `bcryptjs`, `createUserConPassword`, y devuelve éxito (el frontend hace `signIn("credentials", ...)` después para loguear directo).

## Frontend

**`apps/web/app/login/page.tsx`** (nuevo): una sola pantalla con:
- Botón "Continuar con Google" (`signIn("google")`).
- Un formulario correo/contraseña con un toggle "¿Ya tenés cuenta? Iniciar sesión" / "¿No tenés cuenta? Registrate" — mismo formulario, cambia si llama a `POST /api/auth/register` primero (modo registro) o directo a `signIn("credentials", ...)` (modo login).

**Menú lateral** (`apps/web/components/menu/MenuLateral.tsx`): nuevo ítem al final — "Iniciar sesión" si no hay sesión, o el nombre/avatar del usuario + "Cerrar sesión" si la hay. Usa `useSession()` de `next-auth/react`, envuelto en un `<SessionProvider>` en el layout raíz.

**Activar notificaciones logueado**: `apps/web/app/api/push/subscribe/route.ts` — al guardar la suscripción, si `auth()` devuelve sesión, pasa `userId: session.user.id` a `upsertPushSubscription`; si no hay sesión, `userId: null` (comportamiento actual, sin cambios).

## Bootstrapping (pasos manuales de Rodrigo, no automatizables)

1. Crear credenciales OAuth en Google Cloud Console (Client ID + Secret) para `https://sismos-web.vercel.app` y `http://localhost:3000` como orígenes autorizados.
2. Generar `AUTH_SECRET` (`npx auth secret` o `openssl rand -base64 33`) y cargarlo en Vercel.
3. Cargar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` (el email de Rodrigo) en Vercel.

Sin estas variables, el login simplemente no funciona (NextAuth tira error al intentar usarlas) — no hay manejo especial de "modo degradado", porque login es una feature nueva y opcional: si no está configurada, el botón de login puede quedar deployado pero no usable hasta que se carguen las variables, sin afectar nada del resto de la app.

## Testing

- Sin tests automatizados para los callbacks de NextAuth ni para las queries nuevas de `users` (mismo criterio que el resto de `packages/db`/`apps/web` en este repo: sin infraestructura de test para código que toca DB/red, se verifica manualmente). El hasheo de contraseña usa `bcryptjs` directo (librería externa ya probada) — no hay lógica pura nueva propia que amerite un test unitario en esta fase.
- Verificación manual: registro por correo, login por correo, login por Google, logout, y confirmar que activar notificaciones logueado guarda `user_id` en `push_subscriptions` (consulta directa a la base).

## Fuera de alcance

- Panel/pantalla de admin.
- Verificación de email / recuperación de contraseña.
- Migración retroactiva de suscripciones anónimas.
- Comentarios o funciones sociales por sismo.
- `proxy.ts` / protección de rutas por rol.
