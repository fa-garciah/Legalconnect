# LegalConnect MX — Plan de trabajo en paralelo

**Fecha:** 2026-09-21 · **Constitución:** v1.5.0 · **Rama base:** `main` (limpia, `02f30df`)
**Reemplaza como inventario a** [`registro-specs-mvp.md`](./registro-specs-mvp.md), que está
fechado 2026-08-21 y describe como "POR ESCRIBIR" cinco slices que hoy están en `main`.
El registro sigue siendo válido para la §4 (decisiones abiertas) y la §3 (aritmética).

Documento de coordinación, por eso va en español. Nombres de slice, IDs de historia y todo
el contenido de `spec.md` van en **inglés** (Merge Rules).

---

## 1. Estado real del código, verificado hoy

Verificado corriendo `tsc --noEmit` y las suites que no necesitan servicios: backend
**724 tests unitarios en verde**, frontend **382 tests (38 archivos) en verde**, ambos
typecheck limpio.

> **No verificado:** las suites de integración, RLS, aislamiento y `verify:role` necesitan
> Postgres 16 + MinIO por Docker, y **Docker no está disponible en esta máquina**. Las
> afirmaciones de cobertura bloqueante de más abajo vienen de los `quickstart-results.md`
> de cada slice, no de una corrida de hoy. **Primera acción de quien tome este plan:
> levantar Docker y correr la suite completa**, para que el punto de partida sea un hecho
> y no una cita.

| Slice | Tareas | Estado real |
|---|---|---|
| 001-tenant-foundation | 110/110 | **CERRADO** |
| 002-identity-membership | 81/81 | **CERRADO** |
| 003-authentication-mfa | 102/102 | **CERRADO** — identidad propia, Cognito retirado (v1.5.0) |
| 004-authorization-entitlements | 70/70 | **CERRADO** |
| 006-client-case-core | 88/89 | **CERRADO** — el ítem abierto es una nota de censo, no una tarea |
| 007-document-management | 45/54 | **A MEDIAS** — ver §2 |
| 016a-frontend-shell | 54/54 | **CERRADO** |
| 017-firm-directory | 37/37 | **CERRADO** |
| 018-frontend-clients | 76/78 | **CERRADO** — los 2 abiertos son notas de censo |
| 019-frontend-cases | 87/87 | **CERRADO** |

**Sin especificar, sin directorio, sin una línea de código:** 005, 008, 009, 010, 011, 012,
013, 014, 015. Nueve slices de quince.

Lo que un usuario puede hacer hoy de punta a punta: entrar con MFA, enrolarse, recuperar
acceso, ver y administrar el directorio de clientes, y ver y administrar el registro de
expedientes. Nada más. El menú lateral dibuja diez secciones y **siete están marcadas
`available: false`** — que es la decisión correcta, y también el mapa más honesto de lo que
falta ([`navigation-items.ts`](../frontend/src/shell/navigation-items.ts)).

---

## 2. Lo único que está a medias: 007-document-management

El backend está completo y probado: módulo, repositorio, servicio, categorías, validación de
subida, el *chokepoint* de object-store (`backend/src/common/storage/object-store/`), ocho
capacidades en la matriz, ocho acciones de auditoría, migraciones `0026`–`0029`, y el
servicio MinIO ya está en CI.

Falta **todo el frontend y todo el cierre**:

| Tarea | Qué es |
|---|---|
| T044 | `UploadControl/` — consume el endpoint de subida, clasifica rechazos por `feedback/refusal-bucket.ts` |
| T045 | `DocumentList/` — lista, con el estado vacío de 016a |
| T046 | `PreviewPane/` — las tres ramas de research.md D5 (nativo, convertido, sin soporte con descarga) |
| T047 | `CategoryManager/` — catálogo y cambio de categoría |
| T050 | Los dos escenarios e2e de retiro/restauración |
| T051 | `test:isolation`, `test:rls`, `verify:role`, `test:auth-coverage` |
| T052 | `npm test -- --coverage`, umbrales bloqueantes |
| T053 | El `quickstart.md` completo, a mano |
| T054 | Approval Checklist del spec |

Hoy `frontend/src/app/documents/` contiene **un solo archivo, `api.ts`**.

**Defecto de coordinación que hay que resolver antes de escribir la primera línea:** el
registro de navegación apunta a **`/documentos`** (español, como el resto de las rutas:
`/clientes`, `/expedientes`), y las tareas T044–T047 dicen **`frontend/src/app/documents/`**
(inglés). Una de las dos está mal. La convención establecida por 018 y 019 es español en la
ruta, así que lo correcto es mover a `frontend/src/app/documentos/` y **enmendar
`tasks.md` en el mismo PR** — no dejar que el código y el spec se contradigan en silencio.

---

## 3. Deuda de coordinación encontrada hoy

Ninguna bloquea código, todas confunden a quien llegue nuevo. Cuestan minutos.

1. **`registro-specs-mvp.md` está desactualizado un mes.** Dice que 003, 004, 006 y 007
   están "POR ESCRIBIR". Están en `main`. También arrastra bloqueantes de la era Cognito que
   la v1.5.0 retiró.
2. **`.specify/feature.json` apunta a `specs/003-authentication-mfa`.** Spec Kit cree que el
   slice activo es 003. No existe `.spec-context.json`, así que la GUI del Companion no tiene
   estado.
3. **`specs/002-identity-membership/spec.md` todavía nombra a Cognito** en Dependencies y
   Out-of-Scope. Está registrado como diferido a propósito en la v1.5.0; sigue abierto.
4. **`[PENDING]` del alcance del bloqueo de la cuenta AWS** (Data Residency, línea 439 de la
   constitución). Sigue redactado como "no confirmado". Si es *account-wide*, `infra/` no
   despliega nada y eso cambia el plan de Fase 0, no solo una nota al pie.
5. **`[PENDING]` de selección de PAC.** Sin tocar. Bloquea 011 entero.
6. **Ruido en `tests/component/auth/Challenge.test.tsx`**: ocho excepciones no capturadas,
   `document.elementFromPoint is not a function` desde `input-otp` bajo jsdom. Los tests
   pasan, pero es exactamente la forma que tiene un test de volverse intermitente en CI.

---

## 4. El plan en paralelo

El registro de agosto decía, con razón, que *"el paralelismo real empieza en el bloque 3"*
porque 002→003→004 tocaban todos el mismo interceptor. **Esa fundación ya está cerrada**, así
que el paralelismo ya es real — pero solo si el reparto se hace por *propiedad de archivos*,
no por tema.

### El corte: dos carriles que no se tocan

| | **Carril FRONT** | **Carril BACK** |
|---|---|---|
| Toca | `frontend/**` | `backend/**` |
| No toca nunca | `backend/**` | `frontend/**` |
| Dueño sugerido | quien se incorpora | Francisco |

Con este corte los dos carriles pueden correr sin coordinarse durante días. Las **únicas
cuatro superficies compartidas** están en la §5, con su protocolo.

---

### Carril FRONT — secuencia

#### F1. Cerrar 007 (T044–T047, T050–T054) — *empezar por aquí*

**Por qué primero:** un slice a medias es el peor estado en el que se puede dejar código. El
backend ya existe, el contrato está escrito ([`contracts/document-api.md`](./007-document-management/contracts/document-api.md)),
y no hace falta especificar nada nuevo. Es la tarea de mayor valor por unidad de riesgo que
hay en el repo.

**Cómo:**
1. Levantar backend + Postgres + MinIO (`backend/docker-compose.yml`, `npm run db:up`,
   `db:migrate`, `db:seed`) y el front en 3000 contra el back en 3001 — el mismo montaje que
   usaron los `quickstart-results.md` de 018 y 019.
2. Leer `018-frontend-clients/contracts/design-system.md` **antes** de escribir un componente.
   018 estableció el sistema de diseño; 007 consume, no inventa.
3. Resolver `/documentos` vs `documents/` (§2) y enmendar `tasks.md` en el mismo PR.
4. T044→T047 en ese orden. Cada uno renderiza dentro del shell de 016a y usa
   `frontend/src/feedback/` — un clasificador de errores nuevo es un defecto, no una opción.
5. Flag `available: true` para `documentos` en `navigation-items.ts` **solo cuando la pantalla
   exista** — es la regla que el propio archivo documenta.
6. T050–T054: e2e, suites bloqueantes, cobertura, quickstart a mano, Approval Checklist.

**Hecho cuando:** una persona sube, lista, previsualiza y organiza documentos dentro del
shell; `quickstart-results.md` de 007 existe y dice qué se verificó y qué no; los 54 ítems
de `tasks.md` están en `[X]`.

**Estimación:** 5–8 días. **Dependencias:** ninguna. **Bloquea:** nada.

#### F2. Especificar y construir `014-admin-ui`

**Por qué segundo:** es el slice de dominio más independiente que queda del lado frontend.
No introduce ni una tabla: **consume** los endpoints que 002 (invitaciones, membresías), 004
(roles, matriz) y 017 (directorio de la firma) ya exponen y probaron. Historias: EP10 US01–US04.

La instrucción del registro de agosto sigue en pie y es la más importante del slice:
**debe consumir el mecanismo de 002/004, nunca reimplementarlo.** Si aparece una segunda
matriz de permisos en el frontend, el slice está mal hecho.

`/specify` → `/plan` → `/tasks` → `/implement`. Sin `data-model.md` (no hay tablas nuevas).
Sí `contracts/`, porque va a necesitar declarar qué lee de cada upstream.

**Estimación:** 2–3 semanas con TDD estricto. **Dependencias:** 002, 004, 017 — todas cerradas.

#### F3. (Solo si F1 y F2 cierran antes de tiempo) `015-dashboards`

Ojo: 015 es agregador por definición, lee de EP00/02/04/06/09/12/14. Con 009, 010 y 012 sin
existir, hoy solo puede leer de 006 y 017 — es decir, **rendiría una fracción del dashboard
que el spec describe**. No entrar aquí sin recortar el alcance primero, explícitamente, en su
`spec.md`. La página `/` sigue siendo el placeholder de 016a.

---

### Carril BACK — secuencia

#### B1. Especificar y construir `005-session-lifecycle`

**Por qué primero:** es la deuda funcional más visible que dejó 003. Historias EP12
US07/08/11/12. El shell de 016a **no tiene cierre de sesión** — su propio `spec.md` lo declara
fuera de alcance y nombra a 005 como el dueño (línea 355). Hoy un usuario entra y no puede
salir; eso no es un detalle de pulido en un producto bajo secreto profesional.

Incluye: cierre de sesión, listado de sesiones activas, revocación individual y global.

**Punto abierto heredado:** `research.md` D13 de 001 — revocación al desactivar un tenant —
lleva diferido desde agosto. Este es el slice que lo cierra. No volver a diferirlo.

**Estimación:** 2 semanas. **Dependencias:** 003, cerrado.

#### B2. Especificar y construir `013-calendar-core`

**Por qué segundo:** es el dominio limpio que queda. Tablas nuevas, módulo nuevo, cero
conflictos de alcance dentro del MVP. Historias EP05 US01/US04, **sin sincronización judicial
ni exportación a Google** (conflictos de alcance 3, sin input del cliente).

**Estimación:** 2–3 semanas. **Dependencias:** 004, 006 — cerradas.

#### B3. `010-billing-core`

Historias EP09 US01/05/09/12. **Precondición dura:** decidir dónde vive el registro de pago,
porque hoy aparece en EP09 US12 **y** en EP15 US04. Si vive en dos lugares, el ledger diverge
y eso se descubre en producción. Es la decisión #6 de la §4 del registro y el dueño es el
líder técnico de CC. Media hora de decisión; semanas de retrabajo si se omite.

---

### Lo que ningún carril puede tomar, y por qué

| Slice | Por qué no |
|---|---|
| 008-notes-and-activity | Visibilidad de notas sin resolver: ¿producto de trabajo interno o visible al cliente? Afecta privilegio. Decisión de *counsel*, no de ingeniería |
| 009-time-tracking | Conflicto de alcance 4 abierto con el cliente |
| 011-cfdi-stamping | **Doble bloqueo: el PAC sigue `[PENDING]` y el catálogo no tiene una sola historia de timbrado, cancelación, complemento de pago ni multi-emisor de CSD.** Es el trabajo técnico más pesado del MVP, y no está especificado ni estimado. Riesgo número uno de la Fase 1, hoy igual que hace un mes |
| 012-quotes-and-payments | Depende de la misma decisión que B3 |
| EP13 Portal del Cliente | Sin validar y sin flujo de onboarding externo |

---

## 5. Protocolo de archivos compartidos (obligatorio)

Cuatro superficies las tocan todos los slices. Sin este protocolo, dos carriles en paralelo
producen conflictos de merge en cada PR.

| Archivo | Regla |
|---|---|
| `backend/drizzle/NNNN_*.sql` | **Rangos reservados por adelantado.** La última es `0039`. Carril BACK toma `0040–0059`. Carril FRONT no crea migraciones. Quien necesite más, lo anuncia y amplía la tabla aquí |
| `backend/src/common/authz/capability.ts` + `matrix.ts` | Un carril agrega filas por vez. Anunciar antes de tocar. La suite `matrix-exhaustive.test.ts` falla ruidosamente si alguien agrega una capacidad sin aserción — está diseñada así, no la silencies |
| `backend/src/common/audit/actions.ts` | Igual que arriba |
| `backend/src/common/db/schema.ts` | Solo carril BACK |
| `frontend/src/shell/navigation-items.ts` | Solo carril FRONT. Un slice voltea **su propia** bandera `available` en el mismo PR que agrega su pantalla |
| `backend/src/app.module.ts` | Una línea de `imports` por slice. Conflicto trivial, pero avisar |

**Ramas:** `NNN-slug` desde `main`, como las diez que ya existen. Un PR por directorio de
slice (Merge Rules). Todo PR referencia su ID de historia — sin eso se rechaza por el
Principio I.

**Nunca mezclar en rojo.** Toda compuerta de CI es bloqueante por constitución.

---

## 6. Las tres cosas que no se arreglan programando

Están en la §4 del registro de agosto y **siguen todas abiertas un mes después**. Ninguna es
trabajo de ingeniería; todas bloquean ingeniería.

1. **Historias de CFDI en el catálogo.** Sin esto, 011 no existe, y 011 es el trabajo más
   caro del MVP.
2. **Selección de PAC**, con multi-emisor como requisito eliminatorio.
3. **Alcance del bloqueo de la cuenta AWS.** La constitución lo tiene como `[PENDING]` "no
   confirmado". Si resulta ser de cuenta completa, no hay nada desplegable y eso se sabe
   ahora o se sabe en la semana 12.

Y una cuarta que el registro pone al final con razón: **el acuerdo marco de IP con Felipe.**
No bloquea código. Bloquea todo lo demás.

---

## 7. Primer día de quien tome este plan

1. `git clone`, `npm ci` en `backend/` y `frontend/`.
2. Docker arriba: `cd backend && npm run db:up && npm run db:migrate && npm run db:seed`.
3. **Correr la suite completa y anotar el resultado.** `npm test` en backend, `npm test` y
   `npm run test:e2e` en frontend. Ese número es la línea base; hoy nadie la tiene verificada
   entera.
4. Leer, en este orden: `.specify/memory/constitution.md` (principios I–VI y Merge Rules),
   `specs/016a-frontend-shell/spec.md`, `specs/018-frontend-clients/contracts/design-system.md`.
5. Rama `007-document-management-frontend` desde `main`. Empezar por T044.
