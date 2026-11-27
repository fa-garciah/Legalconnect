// Live smoke test of a running LegalConnect (default: the local rehearsal on :4100).
// For each demo role: sign in with password + TOTP, open every section, and record what the
// API and the console said. Not part of CI: it drives a real stack with the demo seed loaded.
//
//   node tools/demo-video/smoke.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', 'frontend', 'package.json'));
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:4100';
const OUT = process.argv[3] ?? join(here, 'out', 'smoke');
mkdirSync(OUT, { recursive: true });

export const PASSWORD = 'demo-local-legalconnect-2026';
// Each person's TOTP key is derived exactly as backend/drizzle/demo/firm.ts derives it (the first
// 20 bytes of sha256("demo-totp-<slug>")), so no base32 secret is written in this file (SC-009).
export const PEOPLE = {
  MP: { email: 'alejandro.mendez@demo.legalconnect.mx', slug: 'mendez' },
  AA: { email: 'jorge.gonzalez@demo.legalconnect.mx', slug: 'gonzalez' },
  PL: { email: 'mariana.torres@demo.legalconnect.mx', slug: 'torres' },
  CM: { email: 'rocio.villalobos@demo.legalconnect.mx', slug: 'villalobos' },
  BM: { email: 'sergio.pantoja@demo.legalconnect.mx', slug: 'pantoja' },
  SA: { email: 'ivonne.carrasco@demo.legalconnect.mx', slug: 'carrasco' },
};

// navigation-items.ts: who is offered each section.
const SECTIONS = {
  '/expedientes': ['MP', 'AA', 'PL', 'CM', 'SA'],
  '/clientes': ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'],
  '/documentos': ['MP', 'AA', 'PL', 'CM', 'SA'],
  '/calendario': ['MP', 'AA', 'PL', 'CM', 'SA'],
  '/kpis': ['MP', 'CM', 'SA'],
  '/horas': ['MP', 'AA', 'PL', 'CM'],
  '/configuracion': ['MP', 'SA'],
};

const totpKey = (slug) => createHash('sha256').update(`demo-totp-${slug}`).digest().subarray(0, 20);

/** RFC 6238, 30 s, 6 digits. Waits for a fresh step when the current one is about to expire. */
export async function totp(slug) {
  if (30 - (Math.floor(Date.now() / 1000) % 30) < 5) await new Promise((r) => setTimeout(r, 6000));
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', totpKey(slug)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export async function signIn(page, base, person, typeDelay = 0) {
  await page.goto(`${base}/ingresar`);
  await page.getByPlaceholder('nombre@despacho.mx').fill('');
  await page.getByPlaceholder('nombre@despacho.mx').pressSequentially(person.email, { delay: typeDelay });
  await page.getByPlaceholder('Tu contraseña').pressSequentially(PASSWORD, { delay: typeDelay });
  await page.getByRole('button', { name: /continuar/i }).click();
  await page.getByLabel('Código de verificación').waitFor({ timeout: 15000 });
  const code = await totp(person.slug);
  await page.getByLabel('Código de verificación').pressSequentially(code, { delay: typeDelay ? 120 : 0 });
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !/\/(ingresar|verificar)/.test(u.pathname), { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch();
  const report = [];
  for (const [role, person] of Object.entries(PEOPLE)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const apiErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/_next/')) apiErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    const row = { role, signedIn: false, landing: null, sections: {} };
    try {
      await signIn(page, BASE, person);
      row.signedIn = true;
      row.landing = new URL(page.url()).pathname;
      for (const [path, allowed] of Object.entries(SECTIONS)) {
        const before = { c: consoleErrors.length, a: apiErrors.length };
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(800);
        const text = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');
        await page.screenshot({ path: join(OUT, `${role}${path.replace('/', '-')}.png`) });
        row.sections[path] = {
          expected: allowed.includes(role) ? 'allowed' : 'refused',
          finalPath: new URL(page.url()).pathname,
          heading: text.slice(0, 90),
          apiErrors: apiErrors.slice(before.a),
          consoleErrors: consoleErrors.slice(before.c),
        };
      }
    } catch (e) {
      row.error = String(e).slice(0, 300);
      await page.screenshot({ path: join(OUT, `${role}-error.png`) }).catch(() => {});
    }
    report.push(row);
    await context.close();
  }
  await browser.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  for (const r of report) {
    console.log(`\n== ${r.role}: signedIn=${r.signedIn} landing=${r.landing}${r.error ? ' ERROR ' + r.error : ''}`);
    for (const [p, s] of Object.entries(r.sections)) {
      console.log(`  ${p.padEnd(15)} ${s.expected.padEnd(8)} -> ${s.finalPath.padEnd(15)} api:${s.apiErrors.join('|') || '-'} console:${s.consoleErrors.length}  «${s.heading.slice(0, 50)}»`);
    }
  }
}

if (process.argv[1]?.endsWith('smoke.mjs')) {
  await main();
}
