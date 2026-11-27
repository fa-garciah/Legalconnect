# Preguntas difíciles para una demo de LegalConnect MX

> Redactado con Antigravity a partir de las especificaciones y revisado contra el código el 27 de noviembre de 2026 (se corrigieron la residencia de datos, el correo, el cifrado en tránsito y los respaldos).

Este documento reúne veinticuatro preguntas de tres evaluadores durante una demostración de LegalConnect MX. Cada respuesta se limita a lo documentado en la guía de funcionamiento vigente.

## 1. Juez o magistrado (Poder Judicial)

### 1. Cadena de custodia de documentos

"¿Cómo acreditan la cadena de custodia de un documento desde que se sube hasta que alguien lo descarga o lo retira?"

**Respuesta honesta:** Hoy no existe; el sistema no genera constancias de cadena de custodia ni historial de versiones. Lo que existe es que cada archivo queda ligado de forma permanente a un solo expediente. Ningún documento se borra físicamente; retirarlo solo lo oculta de la lista activa. Cada carga, cambio de categoría, retiro, restauración, vista previa y descarga queda registrada en auditoría. La bitácora es de solo escritura agregada y registra el identificador interno de quien actuó.

### 2. Integridad y autenticidad

"Si un litigante exhibe un PDF descargado de aquí, ¿cómo compruebo que es idéntico al original y nadie lo alteró?"

**Respuesta honesta:** Hoy no existe; el sistema no firma archivos, no entrega huellas criptográficas ni guarda versiones. Tampoco existe escaneo antivirus de contenido al subir documentos. Lo que existe es control de acceso heredado del expediente y enlaces temporales que caducan en cinco minutos. Los archivos se descargan con su nombre original y toda operación sobre ellos queda en auditoría. Para acreditar autenticidad ante un juzgado, el despacho necesita medios externos a la plataforma.

### 3. Sello de tiempo

"¿Sus registros cuentan con sello de tiempo certificado por un prestador autorizado para probar fecha y hora exactas?"

**Respuesta honesta:** Hoy no existe; la plataforma no emite sellos de tiempo certificados por terceros. Lo que existe es un reloj autoritativo del servidor que anota fecha y hora en cada registro de auditoría. Si una operación no logra escribir su entrada en auditoría, se cancela por completo. En calendario y horas, el sistema usa hora de la Ciudad de México. En registro de horas no se permiten fechas futuras.

### 4. Valor probatorio de lo que el sistema registra

"Si un despacho ofrece su bitácora como prueba, ¿quién garantiza que un socio no borró registros antes de imprimirla?"

**Respuesta honesta:** Hoy no existe; el sistema no genera exportaciones certificadas ni dictámenes con valor probatorio. Lo que existe es una bitácora donde la aplicación carece de permiso en base de datos para editar o borrar. El Socio (MP) ni siquiera puede ver la bitácora; solo el Administrador (SA) consulta la de su despacho. Los registros se conservan durante veinticuatro meses y después se depuran mediante una rutina definida. Cada consulta de la bitácora también genera su propio registro de auditoría.

### 5. Plazos procesales

"¿El sistema calcula términos procesales con días inhábiles de cada tribunal y actualiza fechas cuando cambia un acuerdo?"

**Respuesta honesta:** Hoy no existe; el sistema no calcula plazos procesales ni se conecta con juzgados. Los conectores judiciales aparecen como pendientes en el menú y quedaron fuera del MVP. Lo que existe es un calendario manual para capturar audiencias, vencimientos, reuniones y otros eventos. Los horarios usan hora de la Ciudad de México y los eventos de todo el día conservan su fecha fija. Si un evento se cancela, permanece guardado como cancelado y queda registrado en auditoría.

### 6. Notificaciones

"Si un plazo vence mañana, ¿el sistema envía alertas por correo o WhatsApp, o el abogado depende de entrar a verlo?"

**Respuesta honesta:** Hoy no existe; no hay avisos por correo, WhatsApp ni alertas externas. Tampoco existen invitados ni eventos repetitivos en el calendario. Lo que existe son recordatorios únicamente dentro de la aplicación, en la sección Recordatorios del calendario. Al crear un evento se elige un aviso previo: quince minutos, una hora, o uno, dos o siete días. El abogado debe entrar a la aplicación para ver esos recordatorios.

### 7. Secreto profesional dentro del despacho

"¿Cómo protegen el secreto profesional dentro del despacho para que pasantes o personal administrativo no lean expedientes ajenos?"

**Respuesta honesta:** El sistema aplica seis roles internos con permisos fijos que ningún despacho puede modificar. Asociados (AA), pasantes (PL) y gestores (CM) solo ven expedientes, documentos y eventos donde tienen asignación vigente. Facturación y cobranza (BM) no ve expedientes, documentos, calendario, horas, indicadores ni configuración. Socio (MP) y Administrador (SA) sí ven todos los expedientes del despacho. Si alguien pide un expediente no asignado por enlace directo, recibe la misma respuesta que para uno inexistente. Al retirar a una persona del equipo o desactivar su cuenta, pierde acceso en su siguiente petición.

### 8. Secreto profesional entre despachos y terceros

"Si dos despachos contrarios usan la misma plataforma, ¿qué impide que se mezclen expedientes o que un externo entre?"

**Respuesta honesta:** Cada tabla con datos de despacho usa Row-Level Security directamente en PostgreSQL. El usuario de base de datos de la aplicación no tiene privilegios para omitir esa regla. Sin un contexto de despacho activo, cualquier consulta devuelve cero registros. Todo intento de acceso entre despachos se registra en auditoría y las pruebas de fuga bloquean publicaciones si fallan. Hoy no existe portal del cliente; los cuatro roles externos tienen cero permisos. Además, el operador de Cosmic Chimps (PO) nunca accede a expedientes ni datos internos.

## 2. Socio director escéptico de un despacho mediano

### 1. Por qué cambiar de Excel y carpetas compartidas

"Mi despacho trabaja con Excel y carpetas compartidas desde hace años; ¿qué resuelve esto hoy que ahí no tenga?"

**Respuesta honesta:** Reúne clientes, expedientes, equipos, documentos, calendario, horas e indicadores bajo seis roles con permisos fijos. Cada asociado, pasante o gestor solo ve asuntos donde está asignado, y cobranza no ve expedientes ni archivos. Ningún cliente, documento, evento ni registro de horas se borra físicamente, y cada lectura o cambio se audita. También muestra carga por abogado líder, tiempo promedio de resolución y tasa de éxito sin hojas manuales. Hoy no sustituye facturación, control de tarifas ni seguimiento automático de juzgados.

### 2. Adopción por el equipo

"Mis socios y abogados se resisten a cualquier programa nuevo; ¿qué tropiezos reales vamos a tener al usarlo diario?"

**Respuesta honesta:** La verificación en dos pasos con app autenticadora es obligatoria en cada inicio de sesión. No existe opción para recordar dispositivos ni códigos por SMS o correo. Hoy no existe; el restablecimiento asistido falta, así que perder teléfono y diez códigos exige nueva invitación. El correo de invitaciones tampoco existe todavía, por lo que cada enlace se copia a mano. Además faltan tablero de inicio, carga masiva de documentos y búsqueda dentro del texto de PDFs.

### 3. Costo

"¿Cuánto cuesta exactamente la iguala por mes y qué pasa cuando mis documentos rebasan el espacio del plan?"

**Respuesta honesta:** Hoy no existe; la guía no incluye precios ni costos por usuario o plan. Lo que existe es una estructura de tres planes de iguala: Esencial, Profesional y Premium. Antes de aceptar un archivo, el sistema valida el límite de veinticinco megabytes y el espacio del plan. Si se alcanza el límite, bloquea la carga y avisa que corresponde al plan. Como los archivos retirados no se borran físicamente, su espacio sigue contando en el plan.

### 4. Qué pasa si la empresa desaparece

"Si Cosmic Chimps cierra el año que entra, ¿cómo nos devuelven la información y qué pasa con nuestros expedientes?"

**Respuesta honesta:** Hoy no existe; la guía no contempla plan de continuidad, entrega por cierre ni salida automatizada. Lo que existe es que un despacho nunca se borra físicamente; solo se desactiva dejando sus datos inaccesibles. Mientras el despacho siga activo, sus integrantes con permiso pueden descargar documentos uno por uno. No existe hoy una herramienta para retirar toda la base del despacho de una sola vez.

### 5. Exportar sus datos

"¿Podemos exportar a Excel o ZIP nuestros expedientes, documentos, horas registradas e indicadores cuando queramos?"

**Respuesta honesta:** Hoy no existe; el sistema no tiene exportación masiva de expedientes, documentos, horas, indicadores ni auditoría. Lo que existe es la descarga individual de cada archivo con su nombre original. Los enlaces de descarga caducan en cinco minutos y cada descarga queda registrada en auditoría. En indicadores, cada gráfica se acompaña de una tabla en pantalla con las mismas cifras. En horas, cada usuario solo consulta en pantalla su propia hoja en rangos de hasta sesenta y dos días.

### 6. Facturación

"¿Ya podemos emitir facturas CFDI desde aquí, registrar pagos de clientes y ver los ingresos mensuales del despacho?"

**Respuesta honesta:** Hoy no existe; el módulo de facturación y sus parámetros de configuración no están construidos. Falta decidir si entra al MVP, elegir un PAC multiemisor, definir historias de CFDI y unificar pagos. Por esa razón, la pestaña Financiero y el indicador de ingresos no se muestran en Indicadores. Lo que existe es el alta de clientes con RFC opcional y el rol Facturación y cobranza (BM). Ese rol hoy solo administra clientes y consulta directorio, catálogos de expediente y plan del despacho.

### 7. Horas cobrables

"¿Cómo reviso las horas cobrables de mis abogados, aplico tarifas por expediente y las apruebo antes de cobrarle al cliente?"

**Respuesta honesta:** Hoy no existe; no hay consulta de horas del equipo, tarifas, montos, redondeo ni aprobaciones. Lo que existe es una bitácora laboral auditable donde cada persona ve únicamente sus propias horas. Permite usar un cronómetro en servidor o captura manual con descripción obligatoria y tope de veinticuatro horas. Cada registro solo puede editarse o anularse durante las primeras veinticuatro horas y nunca cambia de expediente. Solo MP, AA, PL y CM usan esta sección; BM y SA no la ven.

### 8. Conflicto de intereses

"Cuando llega un cliente potencial, ¿el sistema verifica si existe conflicto de intereses con asuntos abiertos o cerrados?"

**Respuesta honesta:** Hoy no existe; la plataforma no registra contrapartes ni ejecuta revisiones automáticas de conflicto de intereses. Lo que existe es el padrón de clientes con búsqueda por fragmentos del nombre, sin distinguir mayúsculas. También permite filtrar entre clientes activos e inactivos, pues ninguno se borra de la base de datos. Un Socio (MP) puede revisar manualmente ese padrón y todos los expedientes del despacho antes de aceptar un asunto.

## 3. Auditor de seguridad y privacidad (LFPDPPP)

### 1. Dónde están los datos

"¿En qué países y servidores se alojan hoy la base de datos, los expedientes, los archivos y las llaves de cifrado?"

**Respuesta honesta:** Hoy el despliegue en México no existe; el destino es AWS en México (`mx-central-1`). Rige una excepción temporal de la constitución v1.6.0, del 25 de noviembre de 2026 al 30 de junio de 2027. El prototipo corre en un servidor EC2 con Dokploy en Frankfurt (`eu-central-1`). Los documentos y la llave de cifrado están en Ohio (`us-east-2`). Las identidades y sesiones viven en la propia base de datos de LegalConnect, sin proveedor externo de identidad.

### 2. Quién de Cosmic Chimps puede verlos

"¿Qué personal de Cosmic Chimps tiene acceso a los expedientes, documentos, bitácoras o credenciales de autenticación de un despacho?"

**Respuesta honesta:** El operador de plataforma de Cosmic Chimps (PO) trabaja fuera de las sesiones de despacho. Solo da de alta o desactiva despachos, cambia planes, ajusta límites y emite la primera invitación de SA. Ese operador nunca tiene acceso a los expedientes ni a los datos internos de ningún despacho. Nadie, incluidos SA y Cosmic Chimps, puede leer secretos de la app autenticadora ni códigos de respaldo. Solo el Administrador (SA) de cada despacho puede consultar la bitácora de auditoría de su despacho.

### 3. Cifrado

"¿Cómo cifran los datos en tránsito y en reposo hoy, y qué pasa con las contraseñas y los códigos temporales?"

**Respuesta honesta:** Hoy no existe HTTPS; el prototipo actual usa una dirección temporal por HTTP sin certificado. La constitución exige TLS 1.2 o superior en tránsito y cifrado en reposo. El HTTPS llega con el dominio propio, antes de cargar cualquier dato real. Contraseñas y códigos de respaldo se guardan solo como hashes Argon2id o scrypt, nunca recuperables. Los secretos TOTP se cifran con una llave de aplicación separada de la base de datos. Además, ninguna contraseña, secreto, token ni dato personal de clientes finales aparece en registros ni errores.

### 4. Respaldos

"¿Qué política de respaldos manejan, cada cuándo prueban restauraciones y cómo garantizan la separación de despachos en esos respaldos?"

**Respuesta honesta:** Está diseñado pero en el prototipo todavía no se activa. El diseño es un respaldo nocturno de la base completa, con sus roles y permisos, cifrado con una llave propia en un bucket aparte. La constitución establece que un respaldo solo cuenta si se restaura: el formato se valida restaurándolo con un script de verificación. El aislamiento entre despachos viaja dentro del respaldo, porque las reglas de la base van con él. Además, una copia de la base no permite generar códigos de verificación: esos secretos se cifran con una llave que vive fuera de la base.

### 5. Incidentes

"Si ocurre una vulneración de seguridad o un intento de intrusión, ¿qué protocolo de respuesta y notificación tienen operando hoy?"

**Respuesta honesta:** Hoy no existe; la guía no documenta un protocolo de respuesta ni tiempos de notificación de incidentes. Lo que existe son controles automáticos de sesión y registro en la bitácora de auditoría. Cinco intentos fallidos bloquean el acceso quince minutos sin revelar si el correo existe. Reutilizar un token anterior revoca toda la sesión, y cada intento entre despachos queda auditado. La guía también reconoce que TOTP no protege contra phishing en tiempo real y faltan passkeys.

### 6. Aviso de privacidad

"¿Qué debe incluir el aviso de privacidad del despacho antes de subir expedientes reales a esta plataforma?"

**Respuesta honesta:** Hoy no existe; la plataforma no genera ni administra avisos de privacidad. Lo que establece la guía es una restricción: ningún despacho real puede cargar datos en el entorno actual sin declarar transferencias. El aviso de privacidad del despacho debe declarar la transferencia internacional bajo LFPDPPP. También deberá declarar el uso de Resend fuera de México para el correo transaccional. Además, el entorno requiere dominio propio con HTTPS antes de recibir cualquier dato real.

### 7. Derechos ARCO

"Si un titular solicita cancelación de sus datos bajo LFPDPPP, ¿cómo los suprimen si el sistema prohíbe el borrado físico?"

**Respuesta honesta:** Hoy no existe; la plataforma no tiene flujo de derechos ARCO ni supresión física de registros. Clientes, documentos, eventos, registros de horas y despachos nunca se borran físicamente; solo se desactivan, retiran o anulan. Para rectificación, los datos de clientes sí pueden editarse y cada cambio queda en auditoría. En auditoría nunca se guardan correos ni datos personales, solo identificadores internos. Los registros de auditoría se conservan veinticuatro meses y después se depuran mediante una rutina definida.

### 8. Transferencias internacionales

"¿Qué transferencias internacionales de datos ocurren hoy y qué proveedores extranjeros procesan información de los despachos?"

**Respuesta honesta:** Hoy el prototipo opera fuera de México bajo la excepción temporal de la constitución v1.6.0. La aplicación corre en Frankfurt (`eu-central-1`), mientras los documentos y la llave de cifrado viven en Ohio (`us-east-2`). Para identidades y sesiones no hay proveedor externo; viven en la base propia de LegalConnect. Hoy no existe envío de correos; se eligió Resend, fuera de México, pero falta programarlo. Ningún despacho real puede cargar datos aquí hasta declarar estas transferencias en su aviso de privacidad.
