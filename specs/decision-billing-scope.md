# LegalConnect MX — ¿Facturación y CFDI dentro o fuera del MVP?

**Fecha:** 2026-10-09 · **Tipo:** documento de coordinación (no es un artefacto de SpecKit) ·
**Decide:** Jero, con Felipe para la parte comercial · **Bloquea:** `010-billing-core`,
`011-cfdi-stamping`, `012-quotes-and-payments`

Este documento no especifica nada. Junta en un solo lugar lo que el repositorio dice hoy sobre la
facturación, que no es lo mismo en todas partes, y plantea las dos salidas posibles con sus
consecuencias. Hasta que se elija una, **no se escribe spec para 010, 011 ni 012**.

---

## 1. Lo que dice cada lugar del repositorio

| Dónde | Qué dice | En qué sentido apunta |
|---|---|---|
| `specs/007-document-management/spec.md:33` | "CFDI is now out of MVP entirely (billing excluded, per the current commercial scope)" | **Fuera**, y lo afirma como un hecho del alcance comercial |
| `specs/014-admin-ui/spec.md:9`, Decisión 2 | `US04-EP10-CFG-ConfigureBillingParameters` "deferred to slice `010-billing-core`"; aprobada por el líder técnico el 2026-09-23 | **Dentro, pero después**: trata 010 como un slice pendiente, no como algo excluido |
| `specs/015-kpi-dashboard/spec.md:37`, `:326-334`, Decisión 2 | Quita los ingresos y la pestaña *Financiero* porque "`010-billing-core` is unwritten"; "When it returns: `010` builds it" | **Dentro, pero después**: 010 se trata como pendiente |
| `specs/009-time-tracking/spec.md`, Decisión 4 (ratificada 2026-10-09) | `US10-EP08` (tarifas) pasa "→ 010", junto a `US03-EP15-QTE-SetCaseHourlyRate` | **Dentro, pero después**: mueve trabajo a 010 dando por hecho que 010 existirá |
| `specs/master-user-story-catalog.md`, EP09 | Cuatro historias de facturación marcadas **MVP** (US01, US05, US09, US12) y una nota: **ninguna historia** cubre timbrado con PAC, cancelación con acuse del SAT, complemento de pago ni multi-emisor de CSD | **Dentro** según el catálogo, pero sin el trabajo más pesado escrito |
| `specs/master-user-story-catalog.md`, EP15 | `US01`–`US04-EP15-QTE` marcadas **MVP**, con un `[NEEDS CLARIFICATION]`: ¿el registro de pago de US04 se traslapa con `US12-EP09`? | **Dentro**, con una ambigüedad de diseño abierta |
| `specs/registro-specs-mvp.md` §4 #1 | Historias de CFDI en el catálogo — dueño: Discovery + CC técnico — "bloquea slice 011 entero" | Abierto desde 2026-08-21 |
| `specs/registro-specs-mvp.md` §4 #3 | Selección de PAC (requisito eliminatorio: multi-emisor) | Abierto desde 2026-08-21 |
| `specs/registro-specs-mvp.md` §4 #6 | Dónde vive el registro de pago (EP09 US12 vs. EP15 US04) | Abierto desde 2026-08-21 |
| `.specify/memory/constitution.md`, *PAC Constraints* y Deuda Técnica #4 | PAC `[PENDING]`; "no bloquea 002–010; bloquea 011"; EP09 sin historias de CFDI | **Dentro** como trabajo reconocido, sin fecha |
| `.specify/memory/constitution.md`, *Tier Entitlements* | El límite "monthly CFDI issued" es uno de los tres límites cuantitativos por plan | **Dentro** como mecánica comercial de las igualas |
| `backend/drizzle/seed-demo.ts:66-67` | Los planes demo traen `monthlyCfdi: 50 / 250` | Un límite que hoy nada consume |
| `frontend/src/shell/navigation-items.ts` | `facturacion` existe en el menú con `available: false`; el commit `4fcbaa0` ajustó cómo lo ve BM ("Facturación y cobranza") | Se muestra como sección **por construir**, no como sección descartada |
| `specs/plan-paralelo-2026-09.md` §4, B3 y "Lo que ningún carril puede tomar" | 010 como siguiente del carril BACK, condicionado a decidir dónde vive el pago; 011 con "doble bloqueo"; 012 con el mismo bloqueo que 010 | **Dentro, bloqueado** |

**La contradicción, en una línea:** 007 dice que la facturación está fuera del MVP por alcance
comercial; 014, 015, 009, el catálogo, la constitución y el plan de trabajo la tratan como trabajo
del MVP que todavía no se escribe. Ningún documento registra cuándo ni quién decidió lo que 007
afirma.

---

## 2. Lo que está bloqueado, se elija lo que se elija

Esto no lo resuelve ninguna de las dos opciones; solo decide si importa para el MVP o no.

1. **011 no tiene una sola historia en el catálogo.** Timbrado, cancelación con acuse del SAT,
   complemento de pago y custodia multi-emisor de CSD no existen como historias. Sin ellas, 011 no
   puede especificarse (Principio I).
2. **El PAC sigue `[PENDING]`**, con un requisito eliminatorio: multi-emisor. Sin PAC no hay sandbox
   contra el cual probar el timbrado.
3. **El registro de pago aparece dos veces**: `US12-EP09-BIL-UpdateInvoiceStatus` (marcar pagada) y
   `US04-EP15-QTE-RegisterClientPayment`. Si viven en dos lugares, el saldo de un cliente diverge.
   Es la decisión #6 del registro y bloquea 010 y 012 por igual.
4. **Las tarifas ya no tienen dueño fuera de 010.** `009` (Decisión 4, ratificada) movió
   `US10-EP08-TTK-ConfigureBillableRates` a 010, junto a `US03-EP15-QTE-SetCaseHourlyRate`, y
   `014` movió ahí `US04-EP10-CFG-ConfigureBillingParameters`. Si 010 sale del MVP, esas tres
   historias salen con él.

---

## 3. Las dos opciones

### Opción A — La facturación queda **fuera** del MVP (lo que afirma 007)

**Qué significa:** el MVP registra el trabajo de la firma (expedientes, documentos, calendario,
horas, notas) pero no factura. La firma sigue facturando con su herramienta actual.

**Consecuencias:**
- 010, 011 y 012 pasan a Fase 2. Se marcan así en el catálogo (EP09, EP15, `US10-EP08`,
  `US04-EP10`) en un solo PR, y la nota de 007 deja de ser la única que lo dice.
- La entrada `facturacion` del menú se **quita** o se marca como Fase 2; mostrarla como "Pronto"
  promete algo que no está en el plan.
- La pestaña *Financiero* de 015 y los ingresos no regresan en el MVP; la Decisión 2 de 015 queda
  como estado final, no como pendiente.
- Las horas de 009 quedan como registro sin precio. Es útil para la firma (saber cuánto le costó un
  asunto), pero el valor comercial de "facturar horas" no llega en el MVP.
- El límite `monthlyCfdi` de los planes no mide nada; hay que decidir si las tres igualas se siguen
  vendiendo distinguidas por un límite que no existe (Principio III y *Tier Entitlements*).
- **Riesgo comercial:** si la propuesta de Fase 1 ya prometió facturación, esta opción incumple la
  propuesta. Hay que confirmarlo con Felipe antes de elegirla.
- **Ventaja:** elimina el riesgo técnico número uno de Fase 1 (CFDI con PAC multi-emisor, sin
  historias ni estimación) del calendario de 13 semanas.

### Opción B — La facturación queda **dentro** del MVP (lo que asumen 014, 015, 009 y el catálogo)

**Qué significa:** 010 (facturas), 011 (timbrado) y 012 (cotizaciones y pagos) se especifican y se
construyen antes del cierre del MVP.

**Consecuencias:**
- Antes de escribir **cualquier** spec, hay que producir tres cosas que no son de ingeniería:
  1. Las historias de CFDI en el catálogo (registro §4 #1) — timbrado, cancelación con acuse,
     complemento de pago, multi-emisor de CSD.
  2. La elección del PAC (§4 #3), con sandbox funcional.
  3. La decisión de dónde vive el registro de pago (§4 #6) — una sola tabla, un solo dueño.
- La nota de 007 ("CFDI is now out of MVP entirely") se corrige en el mismo PR que decida esto.
- La custodia del CSD (llave privada de cada firma en un gestor de secretos con KMS, *step-up* MFA
  para subirla) se vuelve trabajo del MVP, con el mismo rigor que los secretos TOTP.
- **Riesgo de calendario:** la aritmética del registro (§3) ya decía que 011 "no es plausible, ni de
  lejos" en 1.7 persona-semanas. Elegir B sin re-estimar el MVP es comprometer una fecha que el
  propio repositorio considera inalcanzable.
- **Ventaja:** cumple lo que el catálogo y la constitución describen, y le da sentido a las horas de
  009, a las tarifas diferidas y al límite `monthlyCfdi` de las igualas.

---

## 4. Lo que se necesita para cerrar esto

| Pregunta | Quién | Desbloquea |
|---|---|---|
| ¿La propuesta comercial de Fase 1 incluye facturación electrónica? | Felipe / CC comercial | La elección entre A y B |
| Si es B: historias de CFDI, PAC y registro de pago único | Discovery + CC técnico | 010, 011, 012 |
| Si es A: un PR que marque EP09, EP15, `US10-EP08` y `US04-EP10` como Fase 2 y corrija el menú | CC técnico | Que el repositorio diga lo mismo en todas partes |

**Recomendación de quien escribe esto:** decidir ahora, aunque la respuesta sea "B, pero en una
fase posterior del MVP". Lo que cuesta caro no es ninguna de las dos opciones, sino seguir con los
dos discursos a la vez: cada slice nuevo (014, 015, 009) ya movió trabajo hacia un 010 que nadie
sabe si existirá.
