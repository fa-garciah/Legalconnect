# LegalConnect MX — Registro de Specs del MVP

**Fecha:** 2026-08-21 · **Constitución:** v1.4.0 · **Backlog:** `master-user-story-catalog.md` (172 US, EP00–EP16)
**Estado:** autoritativo para inventario de specs. Complementa `speckit/slice-roadmap.md`,
que sigue siendo autoritativo para reparto y protocolo de conflictos.

Documento de coordinación, por eso va en español. Los nombres de slice, los IDs de
historia y el contenido de todo `spec.md` van en **inglés** (Merge Rules).

Un slice = un directorio `specs/NNN-slug/`. **La numeración es identidad, no orden de
ejecución.**

---

## 1. Artefactos que exige cada slice

| Artefacto | Cuándo es obligatorio |
|---|---|
| `spec.md` | Siempre. Cero `[NEEDS CLARIFICATION]` para pasar el gate |
| `plan.md` | Siempre. Aquí caen las decisiones de proveedor y despliegue |
| `tasks.md` | Siempre. Tareas de test **antes** de tareas de implementación (TDD estricto) |
| `research.md` | Cuando el slice tiene decisiones técnicas abiertas |
| `data-model.md` | Cuando el slice introduce o altera tablas |
| `contracts/` | Cuando el slice expone endpoints. **Sin esto, ningún frontend puede consumirlo** |
| `quickstart.md` | Cuando el slice necesita procedimiento de verificación manual |
| `## Exposed Read Contracts` (sección dentro de `spec.md`) | Cuando otro slice lee sus datos. Los slices agregadores (015) lo exigen a todos sus upstreams |

---

## 2. Inventario completo

Leyenda de estado: **DONE** · **SPEC OK** (spec escrito, sin clarificaciones) · **POR ESCRIBIR** · **BLOQUEADO** · **NO EXISTE** (ni historias en el catálogo)

### Fundación — bloquea todo lo demás

| Slice | Historias | Estado | Bloqueante |
|---|---|---|---|
| **001-tenant-foundation** | EP00 US01–US08, US10 | **DONE** — RLS activo y probado, audit append-only, CI con coverage bloqueante | — |
| **002-identity-membership** | EP12 US01/04/05/18/19 · EP00 US16 | **SPEC OK** — listo para `/plan` | `plan.md` debe cerrar proveedor de correo transaccional (SES no existe en `mx-central-1`) |
| **003-authentication-mfa** | EP12 US02/03/06/13 | **POR ESCRIBIR** | Verificar passkeys de Cognito en `mx-central-1` antes de aprobar `plan.md`. Requiere acceso a AWS |
| **004-authorization-entitlements** | EP00 US11–US15 | **POR ESCRIBIR** — el spec más grande y el más independiente del código | Ninguno. La matriz sale del catálogo, no del repo |
| **005-session-lifecycle** | EP12 US07/08/11/12 | **POR ESCRIBIR** | `research.md` D13 (revocación al desactivar tenant) sigue diferido |

Cerrada la fundación, `plan.md` de 001 queda sin ítems abiertos.

### Dominio — solo historias MVP

| Slice | Historias MVP | Estado | Bloqueante |
|---|---|---|---|
| **006-client-case-core** | EP03 US02/03/04 · EP02 US01/03/09/10 | **POR ESCRIBIR** | Definition of Done exige la matriz de 004 implementada y testeada |
| **007-document-management** | EP04 US01/02/03/06/15 | **POR ESCRIBIR** | — |
| **008-notes-and-activity** | EP14 US01/02/05 · EP02 US11/12 | **BLOQUEADO** | Visibilidad de notas: ¿producto de trabajo interno o visible al cliente vía EP13? Afecta privilegio. Decisión de counsel |
| **009-time-tracking** | EP08 US01/02/04/05/10/11 | **BLOQUEADO** | Conflicto de alcance 4: alcance y método de time tracking sin cerrar con el cliente |
| **010-billing-core** | EP09 US01/05/09/12 | **POR ESCRIBIR** | — |
| **011-cfdi-stamping** | *ninguna* | **NO EXISTE** | Doble: PAC sigue `[PENDING]` **y** el catálogo no tiene una sola historia de timbrado, cancelación, complemento de pago o multi-emisor de CSD. Ver §4 |
| **012-quotes-and-payments** | EP15 US01–US04 | **BLOQUEADO** | Registro de pago vive en EP09 US12 **y** EP15 US04. Si vive en dos sitios, el ledger diverge |
| **013-calendar-core** | EP05 US01/04 | **POR ESCRIBIR** | Sin sync judicial ni export a Google (conflictos de alcance 3) |
| **014-admin-ui** | EP10 US01–US04 | **POR ESCRIBIR** | Debe **consumir** el mecanismo de 002/004, no reimplementarlo |
| **015-dashboards** | EP01 US01–US03 · EP06 US01/09 | **POR ESCRIBIR** | Al final por definición: lee de todo lo anterior. Requiere `## Exposed Read Contracts` de EP00/02/04/06/09/12/14. Resolver solape EP01 US01 vs. EP06 US01 |

### Frontend

| Slice | Historias | Estado | Bloqueante |
|---|---|---|---|
| **016-frontend-shell** | *ninguna* | **NO EXISTE** | Triple: (a) el catálogo no tiene historias de shell y el Principio I rechaza PRs sin ID; (b) depende de 003 implementado; (c) `plan.md` de 001 registra que no existe árbol `frontend/`. Ver `spec-016-frontend-shell-DRAFT.md` |

### Fuera de la cola — no se especifican

| Qué | Por qué |
|---|---|
| **EP07 — Conectores judiciales** (TSJCDMX, TFJA, IMPI) | Fase 2 comercial, explícitamente fuera de MVP |
| **EP13 — Portal del Cliente** (10 historias) | Sin validar, y sin flujo de onboarding externo. Con MFA obligatoria universal, ese flujo es precondición para que la épica funcione. **No especificar hasta que exista** |
| **EP16 — Centro de Costos** | DRAFT completo, 4 preguntas abiertas de Discovery |
| **Operación offline** | Arquitectónicamente incompatible con el plan actual. Si sobrevive Discovery, la cotización no es entregable |
| **App móvil nativa, WhatsApp, Google Calendar** | Conflictos de alcance 1, 2 y 3, sin input del cliente |
| **Toda historia IT2 / IT3 / TBD** | Hasta que el MVP esté cerrado |

---

## 3. Aritmética que hay que mirar de frente

**15 slices por especificar.** Mínimo tres artefactos cada uno = **45 documentos**, más
`research.md`, `data-model.md` y `contracts/` en la mayoría. Y luego implementarlos, con
TDD estricto y coverage bloqueante en aislamiento de tenant y códigos de respaldo.

**Dos personas. 13 semanas = 26 persona-semanas.** Eso da **~1.7 persona-semanas por
slice**, incluyendo spec, plan, tasks, implementación con TDD y frontend.

Para slices como `013-calendar-core` es plausible. Para `011-cfdi-stamping` — timbrado
ante PAC, cancelación con acuse SAT, complemento de pago y custodia multi-emisor de CSD —
no lo es, ni de lejos. Y ese slice **no tiene ni una historia escrita**, así que tampoco
está estimado.

Tres consecuencias que no se resuelven trabajando más rápido:

1. **La estimación de 13 semanas no contempla frontend por slice.** Si 006–015 pasan a ser
   full-stack, se recalcula antes de comprometerla, no en la semana 10.
2. **El hueco de CFDI es el trabajo técnico más pesado del MVP y está sin especificar y sin
   estimar.** Es el riesgo número uno de la Fase 1.
3. **El paralelismo real empieza en el bloque 3.** La fundación (002→003→004) está
   serialmente acoplada en código: los tres tocan el mismo interceptor. Vender paralelismo
   ahí es autoengaño.

---

## 4. Lo que hay que producir antes de escribir más specs

Ordenado por apalancamiento. **Ninguno se resuelve escribiendo un spec.**

| # | Acción | Dueño | Bloquea |
|---|---|---|---|
| 1 | Historias de CFDI en el catálogo (timbrado, cancelación, complemento, multi-emisor) | Discovery + CC técnico | Slice 011 entero |
| 2 | Acceso a AWS y verificación de passkeys en `mx-central-1` | quien maneje infra en CC | `plan.md` de 003, y por transitividad 005 y 016 |
| 3 | Selección de PAC (requisito eliminatorio: multi-emisor) | Discovery | Slice 011 |
| 4 | Validación o diferimiento formal de EP13 | Discovery | EP13 completa, US10/US11 de EP01, visibilidad de notas |
| 5 | Cuatro conflictos de alcance | Discovery | Slice 009 directamente; 013 parcialmente |
| 6 | Dónde vive el registro de pago (EP09 US12 vs. EP15 US04) | CC técnico | Slice 012 |
| 7 | Visibilidad de notas (privilegio) | Counsel + Discovery | Slice 008 |
| 8 | Historias de shell de frontend en el catálogo | CC técnico | Slice 016 |
| 9 | Proveedor de correo transaccional (SES no existe en la región) | `plan.md` de 002 | Slice 002 |
| 10 | Línea de infraestructura cloud en el costeo | CC comercial | Las tres tarifas de iguala |
| 11 | Reconciliación del catálogo: crear EP14/EP15 formalmente, corregir nombres divergentes, IDs duplicados en EP01, convención `ModuleCode` | CC técnico | Gate de specs, entrada al backlog de GitHub |
| 12 | Acuerdo marco de IP / propiedad con Felipe | CC dirección | No bloquea código. Bloquea todo lo demás |

**Producir superficie de spec con doce decisiones abiertas fabrica retrabajo.** El único
spec que se puede escribir hoy sin depender de ninguna de estas es
`004-authorization-entitlements`, porque su matriz sale del catálogo y no del repo.

---

## 5. Siguiente acción concreta

1. A corre `/plan` sobre `002-identity-membership`. El `spec.md` está cerrado; el plan
   decide proveedor de correo y nada más queda abierto para ese slice.
2. B abre `specs/004-authorization-entitlements/` y corre `/specify`.
3. Alguien con acceso a AWS verifica passkeys de Cognito en `mx-central-1` esta semana.
4. Alguien escribe las historias de CFDI. Es el hueco más caro del inventario.
