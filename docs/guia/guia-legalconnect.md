# Guía de funcionamiento de LegalConnect MX

> Redactado con Antigravity a partir de las especificaciones y revisado contra el código el 27 de noviembre de 2026 (se corrigieron la residencia de datos, el correo, el cifrado en tránsito y los respaldos).

Esta guía explica cómo funciona LegalConnect MX hoy. Está escrita para socios de despachos y para el equipo de Cosmic Chimps. Todo el contenido proviene de las especificaciones y del código vigente en el repositorio.

## 1. Qué es LegalConnect

LegalConnect MX es una aplicación web para despachos de abogados en México. Varios despachos operan en la misma plataforma con sus datos completamente separados entre sí. Hoy permite administrar clientes, expedientes, equipos de trabajo, documentos, calendario, registro de horas, indicadores del despacho y configuración interna. Se comercializa en tres planes de iguala: Esencial, Profesional y Premium. Su núcleo es común para todos los despachos, mientras cada uno ajusta sus propios catálogos de trabajo.

## 2. Los roles

El sistema define seis roles internos con permisos fijos. Ningún despacho puede modificar qué permisos tiene cada rol. El rol determina qué puede hacer una persona y es independiente de su puesto en el directorio.

Asociado (AA), Pasante (PL) y Gestor de casos (CM) solo ven los expedientes donde están asignados. Socio (MP) y Administrador (SA) ven todos los expedientes del despacho. Facturación y cobranza (BM) no ve expedientes, documentos, calendario, horas, indicadores ni configuración.

| Rol | Qué ve | Qué puede hacer |
| --- | --- | --- |
| Socio (MP) | Todos los expedientes, clientes, documentos, calendario, indicadores, configuración y sus propias horas. No ve la bitácora de auditoría. | Administrar clientes, expedientes, equipos, documentos, eventos, catálogos y puestos. Invitar roles menores a SA, revocar invitaciones y desactivar usuarios. Registrar sus horas. |
| Asociado (AA) | Clientes y sus propias horas. Expedientes, documentos y eventos solo de asuntos asignados. No ve indicadores ni configuración. | Cambiar estado y declarar resultado en sus expedientes. Subir, ver y descargar documentos asignados. Gestionar eventos generales o asignados y registrar sus horas. |
| Pasante (PL) | Clientes y sus propias horas. Expedientes, documentos y eventos solo de asuntos asignados. No ve indicadores ni configuración. | Crear y editar clientes sin desactivarlos. Ver expedientes asignados. Subir, ver y descargar documentos asignados. Gestionar eventos generales o asignados y registrar sus horas. |
| Gestor de casos (CM) | Clientes, indicadores del despacho y sus propias horas. Expedientes, documentos y eventos solo de asuntos asignados. No ve configuración. | Crear expedientes, cambiar estados, declarar resultados y manejar equipos asignados. Subir, ver, descargar y clasificar documentos. Gestionar eventos y registrar sus horas. |
| Facturación y cobranza (BM) | Clientes, directorio, catálogos de expediente y plan del despacho. No ve expedientes, documentos, calendario, horas, indicadores ni configuración. | Consultar, crear, editar, desactivar y restaurar clientes. No accede a contenido de expedientes, documentos ni horas registradas. |
| Administrador (SA) | Todos los expedientes, clientes, documentos, calendario, indicadores, configuración y la bitácora de auditoría del despacho. No ve registro de horas. | Administrar clientes, expedientes, equipos, documentos, eventos, catálogos, puestos e invitaciones. Cambiar roles de miembros y consultar auditoría. No registra horas. |

El operador de plataforma de Cosmic Chimps (PO) trabaja fuera de las sesiones de despacho. Solo da de alta o desactiva despachos, cambia planes, ajusta límites y emite la primera invitación de SA. Nunca tiene acceso a los expedientes ni a los datos internos de ningún despacho. Los cuatro roles de portal externo (CC, IC, CB y EL) tienen cero permisos hoy.

## 3. Módulo por módulo

### 3.1 Acceso y verificación en dos pasos

**Para qué sirve**

Comprueba la identidad de cada persona antes de dar acceso a los datos de un despacho. Permite que una misma persona pertenezca a varios despachos sin mezclar su información.

**Pasos principales**

- Un administrador o socio genera una invitación de un solo uso con vigencia de 7 días.
- La persona invitada abre el enlace, confirma su correo y crea su contraseña en un solo paso.
- Antes de entrar a cualquier pantalla, registra una app autenticadora de códigos temporales (TOTP) y confirma un código.
- Al terminar ese registro, el sistema muestra 10 códigos de respaldo de un solo uso por única vez.
- En cada inicio de sesión, la persona ingresa su correo, su contraseña y un código vigente de su app autenticadora.
- Si tiene membresía en más de un despacho, elige el despacho activo al entrar.
- Si pierde su teléfono, usa un código de respaldo y debe registrar una nueva app autenticadora, lo que reemplaza los 10 códigos.

**Reglas que protegen al despacho**

- La verificación en dos pasos es obligatoria para todas las personas y no existe opción para desactivarla.
- No existe opción para recordar dispositivos ni códigos por SMS o por correo electrónico.
- Cinco intentos fallidos seguidos bloquean el acceso durante 15 minutos, sin revelar si el correo existe ni cuántos intentos quedan.
- Cada código temporal funciona en una ventana de 90 segundos y no puede reutilizarse.
- El acceso dura 15 minutos con renovación rotatoria; reutilizar un token anterior revoca toda la sesión.
- Las sesiones expiran por inactividad o tiempo total: 8 y 12 horas para roles internos, 30 minutos y 8 horas para SA.
- Las acciones sensibles exigen un código reciente de la app autenticadora con vigencia de 2 minutos.
- Nadie puede leer secretos de la app autenticadora ni códigos de respaldo, incluidos SA y Cosmic Chimps.
- El restablecimiento asistido de la verificación en dos pasos todavía no existe. Si alguien pierde el teléfono y agota sus 10 códigos, necesita una nueva invitación.

### 3.2 Clientes

**Para qué sirve**

Lleva el padrón de personas físicas y morales que el despacho representa. Todo expediente debe vincularse a un cliente activo del mismo despacho.

**Pasos principales**

- Abrir la lista de clientes, buscar por fragmentos del nombre sin distinguir mayúsculas y filtrar entre activos o inactivos.
- Crear un cliente capturando nombre legal o razón social, tipo (organización o persona) y RFC opcional.
- Actualizar los datos del cliente cuando requieran correcciones.
- Desactivar un cliente para retirarlo de nuevos expedientes, o restaurarlo si se desactivó por error.

**Reglas que protegen al despacho**

- Los clientes nunca se borran de la base de datos; solo cambian entre estado activo e inactivo.
- Desactivar un cliente no altera los expedientes ya abiertos a su nombre, pero impide abrir nuevos expedientes para él.
- El RFC es opcional al registrar un cliente; los datos fiscales completos corresponden a la facturación futura.
- Pasante (PL) puede dar de alta y editar clientes, pero solo MP, BM y SA pueden desactivarlos o restaurarlos.
- Si dos personas editan un cliente al mismo tiempo, queda el último guardado y ambos cambios se registran en auditoría.

### 3.3 Expedientes

**Para qué sirve**

Reúne la información central de cada asunto del despacho: su cliente, sus referencias, su estado, su equipo y su resultado al concluir.

**Pasos principales**

- Crear un expediente indicando cliente activo, número interno único del despacho y estado inicial.
- Capturar de forma opcional la materia, el juzgado y el número asignado por el juzgado.
- Asignar y retirar integrantes del equipo con un rol de trabajo: líder, colaborador o apoyo.
- Cambiar el estado del expediente conforme avanza el asunto.
- Al elegir un estado de cierre, el sistema guarda la fecha de cierre. También pide declarar el resultado: Favorable, Desfavorable, Convenio o Sin resolución.
- En expedientes cerrados previamente sin resultado, se puede declarar el resultado en cualquier momento desde su detalle.

**Reglas que protegen al despacho**

- Estados, materias y juzgados son catálogos propios de cada despacho, creados con valores iniciales neutros y editables por MP y SA.
- Los valores retirados de un catálogo siguen visibles en expedientes antiguos, pero no se ofrecen en expedientes nuevos.
- El número interno del expediente y el número de juzgado son campos distintos; el número interno no puede repetirse dentro del despacho.
- Solo MP, CM y SA crean expedientes y gestionan equipos; MP, AA, CM y SA cambian estados y declaran resultados.
- El rol dentro del equipo (líder, colaborador o apoyo) es informativo; cualquier asignación vigente otorga acceso al expediente.
- AA, PL y CM solo ven los expedientes donde tienen asignación vigente; MP y SA ven todos los asuntos del despacho.
- Al retirar a alguien del equipo o desactivar su cuenta, pierde acceso en su siguiente petición, pero se conserva el historial.
- Si alguien sin asignación pide un expediente por enlace directo, recibe la misma respuesta que para un expediente inexistente.
- Facturación y cobranza (BM) no tiene acceso a expedientes.
- Si un expediente vuelve de un estado de cierre a uno abierto, la fecha de cierre se limpia automáticamente.

### 3.4 Documentos

**Para qué sirve**

Almacena, clasifica, muestra y permite descargar los archivos de cada expediente. Puede consultarse dentro de cada asunto o desde la vista general de documentos del despacho.

**Pasos principales**

- Subir un archivo desde el expediente o desde la sección Documentos, eligiendo primero un expediente accesible y una categoría opcional.
- Si no se elige categoría, el documento se guarda automáticamente bajo "Sin clasificar".
- En la vista general, buscar por nombre de archivo o número de expediente. También filtrar por categoría o expediente y alternar entre cuadrícula y lista.
- Abrir la vista previa directa para archivos PDF e imágenes sin salir de la pantalla.
- Descargar cualquier archivo con su nombre original. Los documentos de Office y texto plano se descargan porque no tienen vista previa integrada.
- Cambiar la categoría de un documento (MP, CM y SA). Retirar un documento o restaurarlo desde la vista de retirados del expediente (MP y SA).

**Reglas que protegen al despacho**

- Todo documento queda ligado de forma permanente a un solo expediente y no puede moverse a otro.
- El acceso a cada documento hereda los permisos de su expediente. Nadie ve ni cuenta documentos de asuntos a los que no pertenece, salvo MP y SA.
- Facturación y cobranza (BM) no ve la sección Documentos ni puede abrir archivos.
- Solo se admiten formatos permitidos (documentos, imágenes y Office común; nunca ejecutables ni comprimidos) con un límite de 25 MB por archivo.
- Antes de aceptar una carga, el sistema verifica si el total resultante cabe en el límite de almacenamiento del plan contratado.
- Cuando se alcanza el límite de almacenamiento, el aviso indica que es límite del plan y lo distingue de una falta de permisos.
- Los documentos nunca se borran físicamente; retirar uno lo oculta de la lista activa, pero su espacio sigue contando en el plan.
- Los enlaces de vista previa y descarga son temporales, caducan en 5 minutos y nunca se guardan en el navegador.
- Cada vista previa y cada descarga generan su propio registro en la bitácora de auditoría.
- El escaneo antivirus de contenido, la búsqueda dentro del texto de PDFs, el historial de versiones y la carga masiva todavía no existen.

### 3.5 Calendario

**Para qué sirve**

Muestra en un solo calendario mensual las audiencias, vencimientos, reuniones y otros eventos del despacho, junto con recordatorios en pantalla.

**Pasos principales**

- Abrir el calendario para ver el mes en curso y el listado ordenado del día seleccionado.
- Crear un evento con tipo fijo (Audiencia, Vencimiento, Reunión u Otro), título y fecha completa o rango horario. Opcionalmente, vincular un expediente y agregar ubicación y notas.
- Elegir un recordatorio opcional antes del inicio: 15 minutos, 1 hora, 1 día, 2 días o 7 días.
- Editar los datos de un evento o cancelarlo previa confirmación.
- Consultar la sección "Recordatorios" en la parte superior para ver eventos próximos cuyo aviso ya está activo.

**Reglas que protegen al despacho**

- Los eventos ligados a un expediente solo son visibles para su equipo asignado, además de MP y SA. Los eventos sin expediente los ven todos los roles con acceso a calendario.
- Facturación y cobranza (BM) no ve el calendario porque los eventos de expediente revelan contenido de los asuntos.
- Ningún evento se borra; al cancelarlo permanece guardado como cancelado y queda registrado en auditoría.
- Cada consulta de calendario cubre un máximo de 62 días y todos los horarios usan hora de la Ciudad de México.
- Los eventos de todo el día se guardan como fecha fija y no cambian de día aunque cambie la zona horaria del navegador.
- Los recordatorios funcionan únicamente dentro de la aplicación. Los avisos por correo o WhatsApp, los invitados y los eventos repetitivos todavía no existen.

### 3.6 Registro de horas

**Para qué sirve**

Registra el tiempo que cada abogado, pasante o gestor dedica a cada expediente, como bitácora laboral auditable sin cálculo de precios todavía.

**Pasos principales**

- Iniciar un cronómetro eligiendo un expediente accesible; el reloj corre en el servidor y continúa aunque se recargue la página.
- Detener el cronómetro con una descripción para guardar los minutos transcurridos, o descartarlo si se inició por error.
- Capturar horas de forma manual eligiendo expediente, fecha de trabajo, horas, minutos y descripción obligatoria.
- Consultar la hoja propia por semana actual, semana anterior, mes o rango de hasta 62 días. La pantalla muestra totales por día y por periodo.
- Corregir fecha, duración o descripción de un registro propio, o anularlo, únicamente durante las primeras 24 horas posteriores a su captura.

**Reglas que protegen al despacho**

- Solo MP, AA, PL y CM tienen acceso a Registro de Horas; BM y SA no ven esta sección.
- Cada persona solo ve y modifica sus propios registros; la consulta de horas del equipo todavía no existe.
- Solo se registran horas en expedientes accesibles; si alguien sale de un expediente con cronómetro en marcha, solo puede descartarlo.
- Cada persona puede tener un solo cronómetro activo a la vez. Cada registro admite entre 1 y 1,440 minutos (tope de 24 horas).
- Si un cronómetro supera 24 horas, el sistema impide detenerlo y pide descartarlo y capturar el tiempo manualmente.
- No se permiten fechas futuras; el día de trabajo siempre corresponde a la fecha de inicio en Ciudad de México.
- Los registros nunca se borran físicamente; al anular uno queda marcado como anulado, sale de los totales y se audita.
- Pasadas 24 horas el registro no puede editarse ni anularse, y el expediente de un registro nunca puede cambiarse.
- Las tarifas por hora, los montos, el redondeo por bloques y las aprobaciones de horas todavía no existen.

### 3.7 Indicadores (KPIs)

**Para qué sirve**

Muestra cifras reales sobre la carga de trabajo, la velocidad de resolución y el resultado de los asuntos cerrados del despacho.

**Pasos principales**

- Seleccionar el periodo de consulta (mes, trimestre o año en hora de Ciudad de México) para comparar contra el periodo anterior equivalente.
- En la pestaña Rendimiento, revisar asuntos activos, tiempo promedio de resolución y carga por abogado líder. También consultar la tendencia trimestral de resolución de los últimos seis trimestres.
- En la pestaña Asuntos, revisar la tasa de éxito general y el desglose de resultados por materia.
- Consultar las tablas de datos que acompañan a cada gráfica con exactamente las mismas cifras.

**Reglas que protegen al despacho**

- Solo MP, CM y SA pueden abrir Indicadores; AA, PL y BM no ven esta sección.
- Si el periodo anterior no tiene datos comparables, no se muestra variación para evitar porcentajes falsos.
- La tasa de éxito general requiere al menos 5 expedientes cerrados con resultado en el periodo. Con menos registros, la tarjeta muestra "Datos insuficientes" e indica cuántos faltan por declarar.
- Los expedientes sin abogado líder se muestran bajo "Sin responsable" y los expedientes sin materia bajo "Sin tipo", sin omitirse.
- La gráfica de carga laboral identifica a cada persona por su puesto en el directorio y nunca expone correos ni datos personales.
- Los trimestres sin cierres muestran un hueco en la gráfica y nunca un cero.
- La pestaña Financiero y el indicador de ingresos no se muestran porque la facturación todavía no existe.

### 3.8 Configuración

**Para qué sirve**

Reúne la administración interna del despacho en cuatro pestañas: Usuarios e invitaciones, Cargos y roles, Matriz de permisos y Categorías de documentos.

**Pasos principales**

- En Usuarios e invitaciones: invitar colegas por correo y rol, copiar el enlace único generado, revocar invitaciones pendientes o desactivar miembros.
- En Cargos y roles: crear o retirar puestos propios del despacho y asignarlos a cada integrante. En esta pestaña, solo SA puede cambiar el rol de sistema de un miembro.
- En Matriz de permisos: consultar por módulo qué puede hacer cada uno de los seis roles internos en vista de solo lectura.
- En Categorías de documentos: agregar categorías nuevas de archivo y retirar las que el despacho deje de usar.

**Reglas que protegen al despacho**

- Solo SA y MP ven y usan Configuración; el resto de los roles no tiene acceso.
- Nadie puede invitar a otra persona con un rol superior al propio; MP no puede invitar ni asignar el rol SA.
- Solo SA puede cambiar el rol de un miembro ya activo.
- El sistema bloquea revocar o cambiar de rol al último SA activo para evitar que un despacho quede sin administrador.
- Invitar, revocar una invitación, desactivar a un miembro y cambiar un rol exigen confirmación con un código reciente de la app autenticadora.
- El enlace de invitación se muestra una sola vez y solo su hash se guarda en base de datos. Si se cierra el aviso sin copiarlo, debe revocarse la invitación y crearse una nueva.
- Los puestos y categorías retirados permanecen visibles en registros anteriores con etiqueta de retirado, pero no se ofrecen para nuevas asignaciones.
- La matriz de permisos es fija y de solo lectura para todos los despachos.
- La configuración de parámetros de facturación todavía no existe.

## 4. Seguridad y privacidad

**Aislamiento entre despachos**

Cada tabla con datos de despacho lleva identificador de despacho y aplica Row-Level Security (RLS) directamente en PostgreSQL. El usuario de base de datos de la aplicación no tiene privilegios para omitir esa regla. Sin un contexto de despacho activo en la transacción, cualquier consulta devuelve cero registros en lugar de mezclar información. El aislamiento abarca archivos, colas, cachés, registros y respaldos. Si alguien pide un dato de otro despacho, recibe la misma respuesta que para un recurso inexistente. Cada intento de acceso entre despachos queda registrado en auditoría. Los despachos nunca se borran físicamente; se desactivan conservando sus datos inaccesibles. Las pruebas de fuga entre despachos se ejecutan en cada cambio y bloquean cualquier publicación si fallan.

**Verificación en dos pasos obligatoria**

Toda cuenta requiere contraseña y código temporal de app autenticadora (TOTP) en cada inicio de sesión. No existe ajuste, bandera ni plan que permita omitirla o recordar dispositivos. El envío de códigos por SMS está prohibido y los códigos por correo están diferidos. Las cuentas reciben 10 códigos de respaldo de un solo uso y las operaciones críticas exigen confirmación reciente con la app autenticadora. El repositorio documenta una limitación actual: los códigos TOTP no protegen contra phishing en tiempo real. Las llaves de acceso (passkeys) todavía no existen.

**Cifrado**

La constitución exige TLS 1.2 o superior en tránsito y cifrado en reposo. El prototipo actual todavía usa una dirección temporal por HTTP, sin certificado; el HTTPS llega con el dominio propio, antes de cualquier dato real. Las contraseñas y los códigos de respaldo se guardan únicamente como hashes de memoria intensiva (Argon2id o scrypt), nunca recuperables. Los secretos de la app autenticadora se cifran con una llave de aplicación separada de la base de datos. Una copia aislada de la base no permite generar códigos válidos. Ninguna contraseña, secreto, token ni dato personal de clientes finales puede aparecer en registros de aplicación, mensajes de error o auditoría.

**Auditoría (qué queda registrado)**

La bitácora es de solo escritura agregada: la aplicación no tiene permiso en base de datos para modificar ni borrar entradas existentes. Si una operación no logra escribir su registro de auditoría, la operación se cancela por completo. Cada registro anota quién actuó mediante identificador interno, nunca por correo ni datos personales. También registra la acción, la entidad afectada, la fecha y hora de reloj autoritativo, el origen y el despacho. Se auditan todas las altas, cambios y bajas de despachos, planes, invitaciones, membresías, roles y puestos. También se auditan modificaciones de clientes, expedientes, estados, resultados, equipos, documentos, categorías, eventos y horas. Además quedan registrados los inicios de sesión, los eventos de verificación en dos pasos y los intentos entre despachos. También se registran las lecturas interactivas sensibles: consultar la bitácora, abrir un expediente, previsualizar un documento y descargar un documento. Los registros se conservan durante 24 meses y se depuran después mediante una rutina definida. Solo SA puede consultar la bitácora de su propio despacho.

**Dónde viven los datos**

El destino es AWS en la región de México (`mx-central-1`). Mientras tanto rige una excepción temporal, del 25 de noviembre de 2026 al 30 de junio de 2027 (constitución v1.6.0). El prototipo corre en un servidor EC2 con Dokploy en Frankfurt (`eu-central-1`), y sus documentos y su llave de cifrado están en Ohio (`us-east-2`). Las identidades y sesiones viven en la propia base de datos de LegalConnect, sin proveedor externo de identidad. Ningún despacho real puede cargar datos en este entorno hasta que su aviso de privacidad declare la transferencia bajo LFPDPPP. El correo transaccional usará Resend, fuera de México, y también se declarará en el aviso de privacidad.

## 5. Lo que todavía no existe

- **Facturación**: Todavía no existe. Falta decidir si entra al MVP, elegir un PAC multi-emisor, definir historias de CFDI y unificar pagos.
- **Conectores judiciales**: Todavía no existe. Aparece en el menú como pendiente y la sincronización con juzgados quedó fuera del MVP.
- **Portal del cliente**: Todavía no existe. Los roles externos tienen cero permisos y el alta de clientes externos sigue sin especificarse.
- **Correo de invitaciones**: Todavía no existe. Se decidió usar Resend; falta programarlo y verificar un dominio propio. Hoy el enlace se copia y se comparte a mano.
- **Tablero de inicio**: Todavía no existe. Inicio aparece como pendiente y el sistema redirige a la primera sección disponible de cada rol.

## Fuentes

- `.specify/memory/constitution.md`
- `specs/001-tenant-foundation/spec.md`
- `specs/002-identity-membership/spec.md`
- `specs/003-authentication-mfa/spec.md`
- `specs/004-authorization-entitlements/spec.md`
- `specs/006-client-case-core/spec.md`
- `specs/007-document-management/spec.md`
- `specs/009-time-tracking/spec.md`
- `specs/013-calendar-core/spec.md`
- `specs/014-admin-ui/spec.md`
- `specs/015-kpi-dashboard/spec.md`
- `specs/017-firm-directory/spec.md`
- `specs/021-frontend-documents/spec.md`
- `specs/023-firm-documents/spec.md`
- `specs/decision-billing-scope.md`
- `frontend/src/shell/navigation-items.ts`
- `backend/src/common/authz/capability.ts`
- `backend/src/common/authz/decide.ts`
- `backend/src/common/authz/declare.ts`
- `backend/src/common/authz/entitlement.ts`
- `backend/src/common/authz/interceptor.ts`
- `backend/src/common/authz/matrix.ts`
- `backend/src/common/authz/refusal.ts`
- `backend/src/common/authz/scope.ts`
