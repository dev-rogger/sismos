# Amigos + alertas de "pudo haber sentido este sismo" — design

## Propósito

`sismos` ya tiene cuentas de usuario opcionales (NextAuth v5, JWT sin DB adapter, ver `2026-08-17-cuentas-de-usuario-design.md`) y notificaciones push anónimas por radio/magnitud alrededor de un centro que cada quien define. Este spec agrega una capa social mínima sobre esa base:

1. Un usuario logueado puede agregar a otros usuarios registrados como **amigos**.
2. Cada relación de amistad tiene un **toggle direccional, apagado por defecto**: "avisame si este amigo pudo haber sentido un sismo".
3. Cuando entra un sismo nuevo, si un amigo (con el toggle activado hacia vos) tenía una ubicación guardada dentro del radio estimado como "sentido" de ese sismo, te llega un push automático — sin que el amigo haga nada en el momento. La detección es **automática vía última ubicación guardada**, no por auto-reporte ("sí, lo sentí") del amigo. Esta es una decisión de arquitectura ya tomada por Rodrigo explícitamente; este spec no la cuestiona ni ofrece la alternativa de auto-reporte.

Este documento es **solo de diseño**: no se toca `schema.ts` real, no se crea ninguna migración, no se escribe código de implementación. Los bloques de código son ilustrativos, igual que en el spec de cuentas de usuario.

## Decisiones de scope

Estas son decisiones que tomé con mi criterio de diseño donde el pedido original dejaba la puerta abierta. **Rodrigo tiene que revisarlas y confirmarlas o corregirlas** — están señaladas también en el cuerpo del spec, pero las junto acá para que sea fácil repasarlas de una:

1. **Amistad requiere aceptación mutua** (solicitud pendiente → aceptada), no agregado directo sin confirmación. Elegí esto porque la feature termina compartiendo (indirectamente) señales de ubicación con otra persona — agregar a alguien sin que se entere ni pueda decir que no me parece mal dado que ya es un dato sensible. Si Rodrigo prefiere agregado directo sin fricción (más parecido a "seguir" que a "amistad"), es un cambio menor de una sección del modelo de datos, no del resto del spec.
2. **Búsqueda de amigos por email exacto completo únicamente**, sin búsqueda parcial ni por nombre. Ver sección "Búsqueda de usuarios" para el razonamiento de enumeración. Si Rodrigo quiere sumar un campo `username` para buscar sin exponer el email, es una extensión futura, no la hago acá porque agrega una tabla/columna nueva no pedida explícitamente.
3. **Rechazar una solicitud borra la fila** (no hay estado "rechazada" ni lista de bloqueados). Cualquiera de las dos partes puede volver a mandar/recibir una solicitud después. No hay feature de "bloquear usuario" en este spec — si aparece abuso/spam de solicitudes en la práctica, es un spec aparte.
4. **Toggle global "compartir mi ubicación aproximada con mis amigos"**, independiente de tener amigos o no, default **apagado**. Vive junto a la pantalla de "Mis amigos" (no en el panel de notificaciones existente, para no mezclar el radio de notificaciones anónimas —que ya existe— con esta ubicación nueva que se comparte con personas, no solo con el servidor).
5. **No hay push de "fulano te agregó/te mandó una solicitud de amistad"**. La solicitud aparece la próxima vez que el destinatario abre "Mis amigos". Decidí no sumar un segundo disparador de push para esto porque no es el objetivo pedido (que es la alerta de sismo sentido) y cada push nuevo es una fuente más de fatiga de notificaciones; si Rodrigo lo quiere, es un agregado chico sobre este mismo spec.
6. **Radio "sentido" de un sismo por magnitud**: hoy el código no tiene ningún concepto de "hasta dónde se sintió un sismo" — el `radioKm` de `pushSubscriptions` es el radio que **cada usuario elige alrededor de su propio centro**, no una propiedad física del evento. Para esta feature hace falta estimar un radio a partir de la magnitud. Propongo una heurística simple (ver "Backend — cálculo del radio sentido") que Rodrigo debe validar o ajustar; no es un dato sismológico real, es un placeholder razonable.
7. **El ítem "Amigos" en el menú es para cualquier usuario logueado, sin importar el rol** — condicionado a `session` (igual que el ítem "Iniciar sesión"/"Cerrar sesión" de hoy), **no** a `session.user.role === "admin"`. El submenú "Admin" solo se usa acá como referencia visual de "cómo se arma un grupo colapsable con sub-ítems" en `MenuLateral.tsx`, no como referencia de a quién se le muestra. Lo dejo explícito en la sección Frontend para que no se confunda con la feature de admin, que sigue siendo una cosa aparte y en paralelo.

## Modelo de datos

Tres tablas nuevas en `packages/db/src/schema.ts`, mismo patrón de columnas planas que el resto del schema.

### `amistades` — relación de amistad (par no dirigido, con estado)

```ts
export const amistades = pgTable(
  "amistades",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // Convención de la capa de queries (no de la DB): usuarioIdA siempre es
    // el menor lexicográficamente de los dos UUID, así el par {A, B} nunca
    // se guarda dos veces en dos órdenes distintos.
    usuarioIdA: text("usuario_id_a").notNull().references(() => users.id),
    usuarioIdB: text("usuario_id_b").notNull().references(() => users.id),
    solicitadoPor: text("solicitado_por").notNull().references(() => users.id),
    estado: text("estado").notNull().default("pendiente"), // "pendiente" | "aceptada"
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("amistades_par_unique").on(table.usuarioIdA, table.usuarioIdB),
  ],
);
```

Al rechazar una solicitud pendiente, o al eliminar una amistad aceptada, la fila se borra (ver decisión de scope #3) — no queda historial de amistades rotas.

### `alertas_amigo` — el toggle direccional

```ts
export const alertasAmigo = pgTable(
  "alertas_amigo",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    usuarioId: text("usuario_id").notNull().references(() => users.id), // quien RECIBE la alerta
    amigoId: text("amigo_id").notNull().references(() => users.id),     // sobre quien es la alerta
    activado: boolean("activado").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("alertas_amigo_par_unique").on(table.usuarioId, table.amigoId),
  ],
);
```

Una fila por dirección: `(usuarioId: A, amigoId: B, activado: true)` significa "A quiere que le avisen si B pudo haber sentido un sismo" — no implica nada sobre la dirección inversa. Cuando una `amistad` pasa a `estado: "aceptada"`, se crean automáticamente **las dos filas** direccionales con `activado: false` (para que "Mis amigos" siempre tenga algo que mostrar/togglear sin tener que manejar el caso "todavía no existe la fila"). Al eliminar la amistad se borran ambas filas.

### `ubicaciones_usuario` — última ubicación aproximada guardada

```ts
export const ubicacionesUsuario = pgTable("ubicaciones_usuario", {
  usuarioId: text("usuario_id")
    .primaryKey()
    .references(() => users.id),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  actualizadaEn: timestamp("actualizada_en").notNull().defaultNow(),
});
```

Tabla aparte, no columna en `users` — elegí esto porque es un dato de naturaleza distinta a la identidad de la cuenta (opcional, sensible, con su propio ciclo de vida de "crear/actualizar/borrar" independiente del resto del perfil) y porque así una fila ausente es, literalmente, "no hay ubicación guardada" sin necesitar una columna booleana aparte para decirlo. La existencia de la fila **es** el "sí, este usuario está compartiendo ubicación en este momento".

El toggle global "compartir mi ubicación con mis amigos" (decisión de scope #4) es una preferencia de cuenta, no un dato de ubicación en sí — vive como columna nueva en `users`:

```ts
// agregado a la tabla `users` existente
compartirUbicacionAmigos: boolean("compartir_ubicacion_amigos").notNull().default(false),
```

Cuando el usuario prende este toggle: se intenta obtener ubicación (ver "Frontend — flujo de permiso") y si se obtiene, se hace upsert en `ubicaciones_usuario`. Cuando lo apaga: se borra la fila de `ubicaciones_usuario` (no solo se deja de actualizar) — así no queda una ubicación vieja dando vueltas en la base para algo que el usuario apagó explícitamente.

## Privacidad

Respondiendo punto por punto lo que pedía el brief:

- **Frecuencia de actualización**: no hay un cron de fondo ni un nuevo permiso de geolocalización "always-on". Se reusa el mismo flujo que ya existe hoy (`useUbicacionUsuario` / `pedirUbicacion()`, ver `apps/web/lib/use-ubicacion-usuario.ts`) — cada vez que la app ya pide ubicación por otro motivo (centrar el mapa, definir el radio de notificaciones anónimas), si el usuario está logueado y tiene `compartirUbicacionAmigos: true`, esa misma llamada también hace upsert en `ubicaciones_usuario`. Además, para que no dependa solo de que el usuario toque el panel de notificaciones, se agrega **una sola llamada silenciosa por apertura de app**: al montar el layout raíz, si hay sesión y el toggle está prendido, se llama `navigator.permissions.query({ name: "geolocation" })`, y solo si el estado ya es `"granted"` (permiso ya dado antes) se pide la posición — así nunca aparece un prompt de permiso nuevo por esta feature sola, solo se aprovecha un permiso ya otorgado antes por otro flujo.
- **Antigüedad máxima**: el backend ignora (trata como "sin ubicación") cualquier fila de `ubicaciones_usuario` con `actualizadaEn` más vieja que un umbral configurable, propuesto en **24 horas** — mismo orden de magnitud que la ventana de reconciliación del ingestor (`RECONCILIACION_LOOKBACK_MS`, 24h en `apps/ingestor/lib/ingest.ts`) y bastante más laxo que el tope de antigüedad del push mismo (`TOPE_ANTIGUEDAD_PUSH_MS`, 60min en `send-push.ts`), porque no se espera que todos abran la app todos los días pero tampoco tiene sentido avisar con una ubicación de hace una semana. Es un valor a ajustar con Rodrigo, no un dato fijo.
- **Ver/borrar la propia ubicación**: sí. La pantalla de "Mis amigos" (o una sub-sección de ajustes ahí mismo) muestra "Última ubicación guardada: hace X" (o "sin ubicación guardada") + un botón "Borrar mi ubicación" que hace `DELETE` directo sobre la fila, independiente de apagar el toggle global (se puede querer borrar sin apagar el toggle — la próxima vez que la app pida ubicación por otro motivo, se vuelve a guardar).
- **Toggle global independiente de tener amigos**: sí, confirmado como decisión de scope #4 — activar "compartir mi ubicación con mis amigos" no depende de tener ya una lista de amigos, y tener amigos no activa el compartir automáticamente. Son dos cosas separadas a propósito: podés tener amigos agregados con el toggle por-amigo apagado y nunca compartir ubicación con nadie.
- **¿Un amigo puede ver tu ubicación exacta en algún momento?** No, nunca vía la API. Ningún endpoint de "Mis amigos" ni de búsqueda devuelve `lat`/`lon` de otro usuario — la única lectura de `ubicaciones_usuario` para un usuario que no es uno mismo ocurre server-side, dentro del cron del ingestor, únicamente para calcular una distancia y decidir "sí/no mandar push". El push resultante solo menciona el nombre del amigo y datos del sismo (ya públicos), nunca coordenadas. Dicho esto, hay que ser honesto sobre el trade-off inherente a la feature: si a Juan le llega "tu amigo Pedro pudo haber sentido este sismo", Juan sabe implícitamente que Pedro estaba dentro del radio estimado del sismo en ese momento — esa es literalmente la funcionalidad pedida, no un bug de privacidad, pero vale dejarlo explícito acá porque es el único punto donde "ubicación de alguien" cruza, indirectamente, hacia otra persona.

## Búsqueda de usuarios

**Se busca por email exacto y completo únicamente** — el input requiere el string completo (`user@dominio.com`), no hay autocompletado ni matching parcial (`ILIKE '%term%'`) ni búsqueda por nombre.

Razonamiento sobre enumeración: si se permitiera buscar por prefijo o por nombre, cualquier usuario logueado podría iterar strings cortos y armar una lista de qué emails/nombres están registrados en la app — un problema real incluso para una app chica. Exigir el email exacto completo eleva el costo de abuso: hace falta ya saber o adivinar el email exacto de alguien, en vez de poder "pescar" con búsquedas parciales.

Esto **no elimina** el problema de enumeración por completo (buscar el email exacto de alguien y obtener "sí existe" / "no existe" sigue siendo, técnicamente, un oráculo de un bit) — es el mismo trade-off que aceptan apps como WhatsApp o Signal para "encontrar contactos por teléfono/email". Mitigaciones que sí propongo:

- La UI **nunca distingue** entre "ese email no está registrado" y "está registrado pero no se puede agregar" (uno mismo, ya son amigos, etc. — bueno, estos últimos casos si aplican se pueden mostrar porque ya se confirmó que existe al hacer el match; lo que nunca se muestra es una diferencia de mensaje entre "no encontrado" por email inexistente vs. por cualquier otro motivo de exclusión que hubiera antes del match).
- La búsqueda **requiere sesión** (ya es así, la pantalla entera está protegida) — no es un endpoint público, así que no se puede automatizar sin ya tener una cuenta real, lo que sube el costo de un ataque masivo (cuenta bloqueable/rate-limitable).
- Rate limit razonable sobre el endpoint de búsqueda (ej. N búsquedas por minuto por usuario) — lo marco como recomendado pero no lo detallo a nivel de infraestructura acá porque el proyecto no tiene hoy ninguna pieza de rate limiting (ni Redis ni Upstash); si Rodrigo lo quiere para el lanzamiento, es una decisión de infra a resolver aparte, no bloquea el resto del spec.

## Backend

### Queries nuevas en `packages/db`

**`packages/db/src/queries/amistad.ts`** (nuevo), siguiendo el patrón de `user.ts`/`push-subscription.ts` (funciones sueltas, sin clases, normalizando filas a un tipo `Amistad`/`SolicitudAmistad`):

- `buscarUsuarioPorEmailExacto(email: string, usuarioIdActual: string): Promise<{ id: string; email: string; name: string | null; image: string | null } | null>` — excluye al propio usuario actual del resultado (nunca "match" con uno mismo).
- `crearSolicitudAmistad(usuarioIdSolicitante: string, usuarioIdDestino: string): Promise<Amistad>` — arma el par ordenado (`usuarioIdA < usuarioIdB`), inserta con `estado: "pendiente"`. Si ya existe una fila pendiente en el sentido inverso (el destino ya me había mandado una solicitud a mí antes de que yo le mandara la mía), la acepta directamente en vez de crear un duplicado — evita el caso raro de "dos solicitudes cruzadas" quedando ambas pendientes.
- `aceptarSolicitudAmistad(amistadId: string, usuarioIdActual: string): Promise<Amistad>` — valida que `usuarioIdActual` sea el destinatario (no el solicitante) antes de aceptar, pone `estado: "aceptada"`, crea las dos filas de `alertas_amigo` con `activado: false`.
- `rechazarOEliminarAmistad(amistadId: string, usuarioIdActual: string): Promise<void>` — sirve tanto para rechazar una pendiente como para eliminar una aceptada; valida que `usuarioIdActual` sea parte del par, borra la fila de `amistades` y, si existían, las de `alertas_amigo` asociadas.
- `listAmigosAceptados(usuarioId: string): Promise<Array<{ amistadId: string; amigo: { id: string; name: string | null; email: string; image: string | null }; alertaActivada: boolean }>>` — join de `amistades` (estado aceptada) + `users` (datos del otro lado del par) + `alertas_amigo` (fila `usuarioId → amigoId` para el toggle propio).
- `listSolicitudesPendientes(usuarioId: string): Promise<{ recibidas: SolicitudAmistad[]; enviadas: SolicitudAmistad[] }>` — separa por `solicitadoPor === usuarioId` o no, para que la UI muestre "aceptar/rechazar" en las recibidas y "cancelar" (mismo `rechazarOEliminarAmistad`) en las enviadas.
- `setAlertaAmigo(usuarioId: string, amigoId: string, activado: boolean): Promise<void>` — valida que exista una amistad aceptada entre ambos antes de tocar el toggle (no se puede activar una alerta sobre alguien que no es amigo aceptado).
- `findAmigosParaSismo(evento: { magnitud: number; latitud: number; longitud: number }): Promise<Array<{ usuarioId: string; amigoId: string; amigoNombre: string | null }>>` — la query que usa el ingestor (ver abajo): trae todas las filas `alertas_amigo` con `activado: true` haciendo join con `ubicaciones_usuario` (por `amigoId`) filtrando `actualizadaEn` dentro del umbral de antigüedad, y filtra en JS por `distanciaKm(...) <= radioSentidoKm(evento.magnitud)` — mismo patrón de "traer candidatos y filtrar en memoria con Haversine" que ya usa `findSubscripcionesParaSismo` en `push-subscription.ts`, no una query geoespacial nueva.

**`packages/db/src/queries/ubicacion-usuario.ts`** (nuevo):

- `upsertUbicacionUsuario(usuarioId: string, lat: number, lon: number): Promise<void>`
- `getUbicacionUsuario(usuarioId: string): Promise<{ lat: number; lon: number; actualizadaEn: Date } | null>` — para que el usuario vea su propia última ubicación guardada en la UI.
- `deleteUbicacionUsuario(usuarioId: string): Promise<void>`

**`packages/db/src/queries/push-subscription.ts`** gana una función nueva:

- `findPushSubscriptionsByUserId(userId: string): Promise<PushSubscription[]>` — todas las suscripciones push del usuario (puede tener más de un dispositivo), para mandarle la alerta de amigo a todos sus endpoints igual que hoy se manda la alerta de sismo normal.

### Cálculo del radio "sentido" (nuevo, en `packages/shared`)

No existe hoy ningún concepto de "radio hasta donde se sintió un sismo" en el código — es una pieza nueva, no una reutilización. Propongo agregar `packages/shared/src/radio-sentido.ts`:

```ts
// Heurística simple, NO un dato sismológico validado — placeholder a ajustar
// con criterio real (ej. tablas de intensidad Mercalli/PGA) si hace falta
// más precisión más adelante.
export function radioSentidoKm(magnitud: number): number {
  if (magnitud < 4) return 0;
  if (magnitud < 5) return 60;
  if (magnitud < 6) return 150;
  if (magnitud < 7) return 300;
  if (magnitud < 8) return 600;
  return 1000;
}
```

Reutiliza `distanciaKm` de `packages/shared/src/distancia.ts` para la comparación — no se reinventa el cálculo de distancia, solo el umbral de qué tan lejos "cuenta" como sentido.

### Pipeline del ingestor — dónde se engancha

En `apps/ingestor/lib/send-push.ts`, junto a `enviarPushParaSismo`, una función nueva `enviarAlertasAmigos(evento: SismoNormalizado)`:

```ts
export async function enviarAlertasAmigos(evento: SismoNormalizado): Promise<void> {
  configurarVapid();
  const matches = await findAmigosParaSismo({
    magnitud: evento.magnitud,
    latitud: evento.latitud,
    longitud: evento.longitud,
  });
  // para cada match, buscar las push subscriptions del usuarioId (no del
  // amigoId) y mandarles un payload que menciona el nombre del amigo, no
  // sus coordenadas.
  ...
}
```

Se llama desde `apps/ingestor/lib/ingest.ts`, **en el mismo punto donde ya se llama `enviarPushParaSismo`** (los dos bloques `if (esNuevo && evento.magnitud >= ...)`, tanto para CSN como para USGS) — mismo `try/catch` que no interrumpe el resto del ingest si falla, mismo gate de magnitud que ya existe hoy (no se agrega un umbral nuevo: si el sismo no califica para notificar en general, tampoco genera alertas de amigos). No se engancha en un pipeline paralelo aparte porque no hay necesidad — es el mismo evento "sismo nuevo e importante", solo un destinatario distinto.

### Rutas API nuevas en `apps/web`

Todas requieren `auth()` con sesión activa (cualquier rol):

- `apps/web/app/api/amigos/buscar/route.ts` — `GET ?email=...`
- `apps/web/app/api/amigos/solicitudes/route.ts` — `POST { destinoUsuarioId }` (crear), `GET` (listar pendientes propias)
- `apps/web/app/api/amigos/[amistadId]/aceptar/route.ts` — `POST`
- `apps/web/app/api/amigos/[amistadId]/route.ts` — `DELETE` (rechazar pendiente o eliminar aceptada, misma función de query)
- `apps/web/app/api/amigos/[amigoId]/alerta/route.ts` — `PUT { activado: boolean }`
- `apps/web/app/api/ubicacion/route.ts` — `GET` (propia), `POST { lat, lon }` (upsert), `DELETE` (borrar)

## Frontend

### Menú lateral — `apps/web/components/menu/MenuLateral.tsx`

**Importante, para no confundir con la feature de admin que ya existe en el mismo archivo**: el ítem "Amigos" se muestra a **cualquier usuario con sesión iniciada, sin importar el rol**. El condicional es `{session && (...)}`, igual que el bloque de "Cerrar sesión" / "Iniciar sesión" que ya existe más abajo en el mismo componente (líneas 330-348 de la versión actual) — **no** `{session?.user?.role === "admin" && (...)}`, que es el condicional del bloque "Admin" (líneas 282-319). Ese bloque de Admin solo sirve acá como referencia visual de "cómo armar un grupo colapsable con sub-botones dentro" (el patrón `useState` + botón con flechita + `pl-9` para los hijos) — no como referencia de a quién mostrárselo.

Agregar, dentro del `<div className="mt-auto border-t ...">`, un nuevo bloque `{session && (...)}` con la misma estructura de colapsable que "Admin" (nuevo `IconoAmigos()`, estado `amigosAbierto`), con dos sub-botones:
- "Mis amigos" → `router.push("/amigos")`
- "Buscar amigos" → `router.push("/amigos/buscar")`

Ubicación sugerida: entre el bloque de "Admin" (que sigue siendo solo para admins) y el de "Instalar app", para que quede agrupado con el resto de ítems relacionados a la cuenta.

### Rutas nuevas — `apps/web/app/amigos/`

**`apps/web/app/amigos/layout.tsx`** (nuevo) — protección por sesión, mismo patrón que `apps/web/app/admin/layout.tsx` pero **sin** chequeo de rol:

```tsx
export default async function AmigosLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <>{children}</>;
}
```

**`apps/web/app/amigos/page.tsx`** ("Mis amigos", nuevo):
- Toggle global arriba: "Compartir mi ubicación aproximada con mis amigos" (default apagado) + texto de última ubicación guardada / botón "Borrar mi ubicación" cuando hay una guardada.
- Sección "Solicitudes pendientes" (si hay alguna): recibidas con botones Aceptar/Rechazar, enviadas con botón Cancelar. Se pliega/oculta si no hay ninguna.
- Lista de amigos aceptados: nombre + email + toggle por fila "Avisame si sintió un sismo" (`activado` de `alertas_amigo`, propio → ese amigo) + botón "Eliminar amistad".

**`apps/web/app/amigos/buscar/page.tsx`** ("Buscar amigos", nuevo):
- Input de email exacto + botón "Buscar".
- Resultado: si hay match, tarjeta con nombre/avatar/email + botón según el estado actual de la relación (`Agregar` / `Solicitud enviada` / `Solicitud recibida — Aceptar` / `Ya son amigos` / deshabilitado si es uno mismo). Si no hay match, un mensaje neutro tipo "No se encontró ningún usuario con ese email" (mismo mensaje siempre, ver sección de privacidad/enumeración).

### Flujo de permiso de ubicación

Se reusa el hook existente `apps/web/lib/use-ubicacion-usuario.ts` (`pedirUbicacion()`) sin modificarlo — no se inventa un flujo de permiso nuevo. Un componente nuevo, montado en el layout raíz junto al resto de providers (`SessionProvider`, etc.), hace lo siguiente cuando hay sesión y `compartirUbicacionAmigos: true`:
1. Al montar, chequea `navigator.permissions.query({ name: "geolocation" })`.
2. Si el estado es `"granted"`, llama `pedirUbicacion()` (la misma función que ya usa el panel de notificaciones) y hace `POST /api/ubicacion` con el resultado.
3. Si el estado es `"prompt"` o `"denied"`, no hace nada — no se dispara un permiso nuevo solo por esta feature; la ubicación se actualiza la próxima vez que el usuario interactúa con algún flujo que ya pide permiso hoy (panel de notificaciones, centrar mapa).

## Bootstrapping (pasos manuales de Rodrigo)

Ninguno nuevo — esta feature no agrega variables de entorno, proveedores de OAuth ni servicios externos. Corre sobre la infraestructura de auth/DB que ya existe.

## Testing

- Sin tests automatizados para las queries nuevas de `amistad.ts`/`ubicacion-usuario.ts` ni para los callbacks/rutas API — mismo criterio que el resto de `packages/db`/`apps/web` en este repo (sin infraestructura de test para código que toca DB/red, se verifica manualmente).
- `radioSentidoKm` (en `packages/shared`) sí es lógica pura nueva y amerita un test unitario simple (rangos de magnitud → radio esperado), siguiendo el patrón de `geocodificacion-aproximada.test.ts` que ya existe en el mismo paquete.
- Verificación manual: buscar por email exacto (existente/inexistente), enviar/aceptar/rechazar solicitud, togglear alerta por amigo, prender/apagar el toggle global de ubicación y confirmar el upsert/delete en `ubicaciones_usuario`, y simular un sismo nuevo con un amigo de prueba dentro/fuera del radio estimado para confirmar que el push de "tu amigo pudo haber sentido este sismo" llega o no llega según corresponda.

## Fuera de alcance

- Chat o mensajería entre amigos.
- Ver la ubicación exacta (o aproximada) de un amigo en el mapa — la ubicación solo se usa server-side para decidir si mandar el push, nunca se expone vía API.
- Push de "fulano te agregó como amigo" / "tenés una solicitud nueva" (decisión de scope #5) — la solicitud se ve al abrir "Mis amigos".
- Bloquear usuarios / lista de bloqueados (decisión de scope #3).
- Auto-reporte de "sí, sentí este sismo" por parte del amigo — la detección es 100% automática vía ubicación guardada, no hay confirmación humana en el momento (decisión de arquitectura ya tomada, fuera de discusión para este spec).
- Cualquier feature social más allá de esto (comentarios, reacciones, ranking de amigos, etc.).
- Rate limiting real sobre el endpoint de búsqueda — recomendado, no detallado a nivel de infraestructura (el proyecto no tiene hoy ninguna pieza de rate limiting).
- Username o cualquier identificador de búsqueda alternativo al email — mencionado como extensión futura posible, no implementado acá.
