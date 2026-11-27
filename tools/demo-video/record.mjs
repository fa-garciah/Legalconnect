// Records the narrated LegalConnect demo against a running stack (default: the local rehearsal).
// Captions, a visible cursor and title cards are drawn into the page, so the .webm explains
// itself with no voice-over. Follows the "Guion de demostración" scene by scene.
//
//   node tools/demo-video/record.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEOPLE, signIn } from './smoke.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', 'frontend', 'package.json'));
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:4100';
const OUT = process.argv[3] ?? join(here, 'out', 'video');
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { force: true, recursive: true });
const SIZE = { width: 1440, height: 900 };

/** Drawn on every page load: caption bar, cursor dot, title card. State survives navigation. */
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('lc-demo-caption')) return;
    const style = document.createElement('style');
    style.textContent = `
      #lc-demo-caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1100px;
        background:rgba(24,22,48,.92);color:#fff;font:500 21px/1.45 system-ui,'Segoe UI',sans-serif;
        padding:14px 26px;border-radius:12px;z-index:2147483646;box-shadow:0 6px 24px rgba(0,0,0,.25);
        text-align:center;transition:opacity .3s}
      #lc-demo-caption:empty{opacity:0}
      #lc-demo-chapter{position:fixed;left:24px;bottom:100px;background:#3b2f9c;color:#fff;
        font:600 14px system-ui,'Segoe UI',sans-serif;padding:6px 12px;border-radius:999px;z-index:2147483646;
        letter-spacing:.02em}
      #lc-demo-chapter:empty{display:none}
      #lc-demo-cursor{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(59,47,156,.35);border:2px solid #3b2f9c;z-index:2147483647;pointer-events:none;
        transition:transform .12s}
      #lc-demo-cursor.down{transform:scale(.7);background:rgba(59,47,156,.6)}
      #lc-demo-card{position:fixed;inset:0;background:#2f2a7a;color:#fff;z-index:2147483645;display:flex;
        flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;
        font-family:Georgia,'Times New Roman',serif}
      #lc-demo-card h1{font-size:54px;margin:0}
      #lc-demo-card p{font:400 24px/1.5 system-ui,'Segoe UI',sans-serif;margin:0;max-width:900px;opacity:.9}
      #lc-demo-card:empty{display:none}`;
    document.head.appendChild(style);
    for (const id of ['lc-demo-caption', 'lc-demo-chapter', 'lc-demo-card', 'lc-demo-cursor']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    const s = sessionStorage;
    document.getElementById('lc-demo-caption').textContent = s.getItem('lc-caption') ?? '';
    document.getElementById('lc-demo-chapter').textContent = s.getItem('lc-chapter') ?? '';
    const cursor = document.getElementById('lc-demo-cursor');
    const [x, y] = (s.getItem('lc-cursor') ?? '720,450').split(',');
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
      s.setItem('lc-cursor', `${e.clientX},${e.clientY}`);
    }, true);
    addEventListener('mousedown', () => cursor.classList.add('down'), true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

const pause = (page, ms) => page.waitForTimeout(ms);

async function caption(page, text, holdMs = 4500) {
  await page.evaluate((t) => {
    sessionStorage.setItem('lc-caption', t);
    const el = document.getElementById('lc-demo-caption');
    if (el) el.textContent = t;
  }, text);
  if (holdMs) await pause(page, holdMs);
}

async function chapter(page, text) {
  await page.evaluate((t) => {
    sessionStorage.setItem('lc-chapter', t);
    const el = document.getElementById('lc-demo-chapter');
    if (el) el.textContent = t;
  }, text);
}

async function card(page, title, subtitle, holdMs = 4500) {
  await page.evaluate(([t, s]) => {
    const el = document.getElementById('lc-demo-card');
    if (el) el.innerHTML = `<h1>${t}</h1><p>${s}</p>`;
  }, [title, subtitle]);
  await pause(page, holdMs);
  await page.evaluate(() => {
    const el = document.getElementById('lc-demo-card');
    if (el) el.innerHTML = '';
  });
}

/** Glides the cursor to the element, then clicks it — so the viewer sees what is pressed. */
async function press(page, locator, opts = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await pause(page, 250);
  }
  await locator.click(opts);
  await pause(page, 600);
}

async function hover(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await pause(page, 400);
}

async function choose(page, scope, comboboxName, optionName) {
  await press(page, scope.getByRole('combobox', { name: comboboxName }));
  const option = typeof optionName === 'number'
    ? page.getByRole('option').nth(optionName)
    : page.getByRole('option', { name: optionName }).first();
  await press(page, option);
}

async function signOut(page) {
  await press(page, page.getByRole('button', { name: 'Cerrar sesión' }).first());
  await page.waitForURL(/\/ingresar/, { timeout: 15000 }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ channel: 'chromium' }); // full Chromium: the headless shell has no PDF viewer
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, locale: 'es-MX' });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // 1. Presentación
  await page.goto(`${BASE}/ingresar`);
  await pause(page, 800);
  await card(page, 'LegalConnect MX', 'La operación de un despacho de abogados en un solo lugar: expedientes, clientes, documentos, agenda, horas e indicadores.', 5500);
  await chapter(page, '1 · Acceso');
  await caption(page, 'Despacho de prueba Méndez & Asociados. Entramos primero como el socio, que ve todo el despacho.');

  // 2. Acceso con verificación en dos pasos
  await caption(page, 'Correo y contraseña…', 0);
  await signIn(page, BASE, PEOPLE.MP, 55).catch(async (e) => { throw e; });
  await caption(page, 'Además de la contraseña, el código de 6 dígitos de la app del celular. La verificación en dos pasos es obligatoria y no se puede apagar.', 5500);

  // 3. Expedientes
  await page.goto(`${BASE}/expedientes`);
  await chapter(page, '2 · Expedientes');
  await caption(page, 'Todos los asuntos del despacho: cliente, materia, juzgado y estado. Como socio, veo todos.', 5000);
  await choose(page, page, 'Tipo', 'Mercantil');
  await caption(page, 'Filtro por materia o por juzgado en un clic.', 3500);
  await choose(page, page, 'Tipo', /todos/i);
  await pause(page, 800);
  const openButtons = page.getByRole('button', { name: /^abrir/i });
  await press(page, openButtons.nth(1));
  await caption(page, 'Cada expediente: número de juicio, juzgado, fechas y su equipo — quién es responsable y quién colabora.', 6000);
  await page.mouse.wheel(0, 400);
  await pause(page, 1500);
  await page.keyboard.press('Escape');
  await pause(page, 800);

  // 4. Documentos
  await page.goto(`${BASE}/documentos`);
  await chapter(page, '3 · Documentos');
  await caption(page, 'Todos los documentos del despacho, clasificados por tipo y por expediente.', 4000);
  const search = page.getByPlaceholder(/buscar por nombre/i);
  await press(page, search);
  await search.pressSequentially('Sentencia', { delay: 90 });
  await pause(page, 1500);
  await press(page, page.getByRole('button', { name: 'Ver', exact: true }).first());
  await caption(page, 'Se leen aquí mismo, sin descargarlos. Cada vista y cada descarga quedan registradas: quién y cuándo.', 7000);
  await page.keyboard.press('Escape');
  await pause(page, 800);

  // 5. Calendario
  await page.goto(`${BASE}/calendario`);
  await chapter(page, '4 · Calendario');
  await caption(page, 'Audiencias, vencimientos y juntas en un solo calendario, con recordatorios de lo que viene.', 5000);
  await press(page, page.getByRole('button', { name: /nuevo evento/i }));
  await caption(page, 'Cada evento puede ligarse a su expediente y llevar un recordatorio previo.', 4500);
  await page.keyboard.press('Escape');
  await pause(page, 600);

  // 6. Indicadores
  await page.goto(`${BASE}/kpis`);
  await chapter(page, '5 · Indicadores');
  await caption(page, 'El socio ve cómo va el despacho: asuntos activos, tiempo de resolución, tasa de éxito y carga por abogado.', 6000);
  await page.mouse.wheel(0, 500);
  await pause(page, 1800);
  await page.mouse.wheel(0, -500);
  await press(page, page.getByRole('tab', { name: 'Asuntos' }));
  await caption(page, 'Y el resultado de los asuntos cerrados, por materia. Todo sale de lo que el equipo ya capturó.', 5000);

  // 7. Configuración
  await page.goto(`${BASE}/configuracion`);
  await chapter(page, '6 · Configuración');
  await caption(page, 'Aquí se invita a la gente y se le asigna un rol.', 3500);
  await press(page, page.getByRole('tab', { name: 'Matriz de permisos' }));
  await caption(page, 'Cada rol tiene permisos fijos: un pasante no ve lo mismo que un socio. Las acciones delicadas vuelven a pedir el código.', 6000);

  // 8. La gestora de casos
  await chapter(page, '7 · Gestora de casos');
  await caption(page, 'Ahora entramos como la gestora de casos.', 2500);
  await signOut(page);
  await signIn(page, BASE, PEOPLE.CM, 45);
  await page.goto(`${BASE}/expedientes`);
  await caption(page, 'Su barra tiene menos secciones y solo ve los expedientes donde participa.', 5000);
  await press(page, page.getByRole('button', { name: /nuevo expediente/i }));
  await caption(page, 'Abre un expediente nuevo…', 0);
  const dlg = page.getByRole('dialog');
  const clientSearch = dlg.getByLabel('Buscar cliente');
  await press(page, clientSearch);
  await clientSearch.pressSequentially('Varela', { delay: 80 });
  await pause(page, 900);
  await choose(page, dlg, 'Cliente', 0);
  const fileNumber = page.getByPlaceholder('EXP-2026-0042');
  await press(page, fileNumber);
  await fileNumber.pressSequentially('EXP-2026-3001', { delay: 70 });
  await choose(page, dlg, 'Estado inicial', 'En Proceso');
  await choose(page, dlg, 'Tipo', 'Mercantil');
  await choose(page, dlg, 'Juzgado', 1);
  const ref = page.getByPlaceholder('1234/2026');
  await press(page, ref);
  await ref.pressSequentially('2215/2026', { delay: 70 });
  await press(page, dlg.getByRole('button', { name: 'Guardar' }));
  await pause(page, 1500);
  await page.goto(`${BASE}/expedientes`);
  const find = page.getByPlaceholder(/buscar por número/i);
  await press(page, find);
  await find.pressSequentially('3001', { delay: 90 });
  await pause(page, 1200);
  await press(page, page.getByRole('button', { name: /^abrir/i }).first());
  await caption(page, 'Quien abre un expediente queda como Responsable de su equipo, así que no lo pierde de vista. Desde aquí suma a un asociado.', 6500);
  await page.keyboard.press('Escape');

  // 9. Registro de horas
  await page.goto(`${BASE}/horas`);
  await chapter(page, '8 · Registro de horas');
  await caption(page, 'Cada persona registra su tiempo por expediente, con cronómetro o a mano.', 4000);
  const timerCase = page.getByLabel('Expediente del cronómetro');
  await press(page, timerCase);
  await timerCase.selectOption({ index: 1 });
  const desc = page.getByLabel('Descripción del trabajo');
  await press(page, desc);
  await desc.pressSequentially('Revisión del contrato de arrendamiento', { delay: 45 });
  await press(page, page.getByRole('button', { name: /iniciar cronómetro/i }));
  await caption(page, 'El reloj corre en el servidor: sigue aunque se cierre la página.', 6000);
  await press(page, page.getByRole('button', { name: /detener y registrar/i }));
  await caption(page, 'Estas horas alimentan los indicadores y, en la siguiente fase, la facturación.', 4500);

  // 10. Cierre
  await chapter(page, '');
  await caption(page, '', 0);
  await card(page, 'Cada quien ve lo que le toca', 'Todo queda registrado. La información de cada despacho está aislada y protegida con verificación en dos pasos y cifrado.', 6500);
  await card(page, 'LegalConnect MX', 'Siguiente fase: facturación y conexión con los juzgados.', 4000);

  const video = page.video();
  await context.close();
  await browser.close();
  const path = await video.path();
  const final = join(OUT, 'legalconnect-demo.webm');
  renameSync(path, final);
  console.log('video:', final);
  for (const f of readdirSync(OUT)) if (f !== 'legalconnect-demo.webm') rmSync(join(OUT, f), { force: true });
}

await main();
