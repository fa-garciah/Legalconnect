/**
 * T006 — 018/FR-020, FR-021. The theme is the whole of this slice's version migration
 * (research D1): the 49 ported components are stock and reference only token utilities, so
 * they work unmodified **provided every token they name is defined**. Miss one and that
 * component renders unstyled — not broken, not throwing, just quietly wrong, which is the
 * hardest failure to notice and the easiest to ship.
 *
 * **Why this reads CSS text rather than computed styles.** The task originally specified
 * mounting an element and asserting its computed colour. That cannot work here: jsdom has
 * no CSS pipeline, so Tailwind utilities resolve to nothing and every assertion would pass
 * vacuously — the worst possible outcome for a test whose whole job is catching a silent
 * gap. Reading the stylesheet is the honest check available in this tier. A real browser
 * check exists too, and it is `tests/e2e/` rendering actual screens.
 *
 * Two layers, deliberately:
 *
 *   1. **The baseline** — every token contracts/design-system.md §3.1 requires. Fixed by
 *      contract, so it holds even before any component is ported.
 *   2. **The correspondence** — every token utility the ported components actually use,
 *      derived by scanning them. Skipped until T011 lands the components. This is the
 *      layer that catches a token nobody thought to list.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GLOBALS = join(process.cwd(), 'src/app/globals.css');
const UI_DIR = join(process.cwd(), 'src/components/ui');

const css = (): string => readFileSync(GLOBALS, 'utf8');

/**
 * contracts/design-system.md §3.1. The colour roles the vendored components reference,
 * each of which must exist as `--color-<name>` for Tailwind to generate `bg-<name>`,
 * `text-<name>`, `border-<name>` and friends.
 */
const REQUIRED_COLOUR_ROLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

describe('the theme contract', () => {
  it('defines every colour role the ported components reference', () => {
    const text = css();
    const missing = REQUIRED_COLOUR_ROLES.filter(
      (role) => !new RegExp(`--color-${role}\\s*:`).test(text),
    );
    expect(missing, 'colour roles absent from globals.css').toEqual([]);
  });

  it('defines the radius scale the components derive their corners from', () => {
    const text = css();
    // Components use `rounded-lg`, `rounded-md`, `rounded-sm`; the prototype's config
    // derived all three from one `--radius`, and that derivation moves into CSS here.
    expect(text).toMatch(/--radius\s*:/);
  });

  it('declares the accordion keyframes that lived in the prototype JS config', () => {
    // `accordion.tsx` uses `animate-accordion-down` / `-up`. These were never in the
    // prototype's animation plugin — they were in its config, so they move here or the
    // accordion silently does not animate.
    const text = css();
    expect(text).toMatch(/accordion-down/);
    expect(text).toMatch(/accordion-up/);
  });

  it('imports the animation utilities as a package, not the retired plugin', () => {
    const text = css();
    // research D2: `animate-in` / `animate-out` come from `tw-animate-css` under this
    // major version. The previous plugin does not load and would fail silently.
    expect(text).toMatch(/tw-animate-css/);
  });

  /**
   * REPLACED BY `020-design-language`, D1 — deliberately inverted, not relaxed.
   *
   * This assertion demanded a dark variant be declared so the ported components' `dark:`
   * classes could fire. It was satisfied, and it was satisfying nothing: `globals.css`
   * carried a full `.dark` palette and NOTHING IN THE PRODUCT EVER APPLIED THE CLASS —
   * no toggle, no system-preference listener, no server-rendered attribute. It had never
   * rendered once.
   *
   * `020`'s D1 removes it rather than completing it, and the assertion follows the
   * decision. This is a contract change the spec authorises, which is a different act
   * from bending a test to accommodate a look (020/SC-003). Dark mode returns as its own
   * story, with a control, a persistence decision and its own contrast table.
   */
  it('declares no theme that nothing can reach', () => {
    const text = css();
    expect(text, 'an unreachable .dark palette is worse than none').not.toMatch(/^\.dark\s*\{/m);
    expect(text).not.toMatch(/@custom-variant\s+dark/);
  });

  it('sets the brand primary rather than leaving the vendor default', () => {
    // research D3: the prototype's own theme left `--primary` a near-black vendor default
    // and hardcoded `#3730A3` fifty times in markup instead. The whole point of this
    // slice's theme is that the brand lives in the token.
    //
    // Resolved through the indirection rather than matched literally: the theme layers
    // deliberately — `--color-primary` names the Tailwind utility, `--primary` names the
    // semantic role, `--brand` names the colour. That is what lets the dark block override
    // the role without touching the brand. A test that demanded the hex appear directly on
    // `--color-primary` would be demanding the layering be flattened.
    const text = css();
    const resolve = (name: string, depth = 0): string => {
      if (depth > 4) return '';
      const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(text);
      if (!m) return '';
      const value = m[1].trim();
      const ref = /^var\(--([a-z-]+)\)$/.exec(value);
      return ref ? resolve(ref[1], depth + 1) : value;
    };

    expect(resolve('color-primary').toLowerCase(), 'the brand must reach --color-primary').toContain(
      '3730a3',
    );
  });
});

/**
 * `020-design-language` — the identity contract, on top of `018`'s token contract.
 *
 * `018` proved the theme was COMPLETE: every role a component references exists. It could
 * not prove the theme was DECIDED, and it was not — the typeface came from
 * `create-next-app`, and there was no type scale, no density and no shape decision
 * anywhere. These assertions cover the decisions rather than the coverage.
 */
const LAYOUT = join(process.cwd(), 'src/app/layout.tsx');
const layout = (): string => readFileSync(LAYOUT, 'utf8');

describe('the identity contract (020)', () => {
  it('loads no scaffold typeface — FR-002, SC-002', () => {
    // `Geist` arrived with `create-next-app`. Nobody chose it, and it was the single
    // clearest signal the product sent that it was a scaffold rather than a product.
    //
    // Asserted against what the file IMPORTS and CALLS, not against the word appearing:
    // the comment above the replacement names what it replaced, which is worth keeping,
    // and a test that forbade naming it would be testing the prose.
    const text = layout();
    expect(text, 'no font may be imported from the scaffold family').not.toMatch(
      /import\s*\{[^}]*Geist[^}]*\}\s*from/,
    );
    expect(text, 'no scaffold font may be instantiated').not.toMatch(/\bGeist(_Mono)?\s*\(/);
  });

  it('loads exactly two families: a serif for display, a sans for interface — FR-002', () => {
    const text = layout();
    expect(text).toMatch(/Newsreader/);
    expect(text).toMatch(/Public_Sans/);
  });

  it('exposes the display family as its own token, so headings do not hardcode it — FR-002', () => {
    expect(css()).toMatch(/--font-display\s*:/);
  });

  it('defines a named type scale rather than ad-hoc sizes — FR-001', () => {
    const text = css();
    const steps = ['display', 'heading', 'body', 'small', 'caption'];
    const missing = steps.filter((s) => !new RegExp(`--text-${s}\\s*:`).test(text));
    expect(missing, 'type-scale steps absent from globals.css').toEqual([]);
  });

  it('defines the secondary accent the brand cannot carry — FR-005', () => {
    // One case needs a second hue: telling a natural person from an organisation, and
    // marking a suspended matter. `018` had to reach for `accent` and `secondary` to fake
    // it and recorded that as a gap in its own addendum.
    const text = css();
    expect(text).toMatch(/--accent-warm\s*:/);
    expect(text).toMatch(/--accent-warm-tint\s*:/);
  });

  it('keeps the decided brand and its pressed state — FR-004', () => {
    const text = css().toLowerCase();
    expect(text).toContain('#3730a3');
    expect(text).toContain('#2d2582');
  });

  it('grounds the product on a warm surface rather than pure white — FR-006, D3', () => {
    const text = css();
    const m = /--background\s*:\s*([^;]+);/.exec(text);
    expect(m, '--background must be defined').not.toBeNull();
    expect(m![1].trim().toLowerCase(), 'a pure-white ground makes indigo read as generic SaaS')
      .not.toMatch(/^#fff(fff)?$/);
  });

  it('names its density rather than guessing per screen — FR-008', () => {
    const text = css();
    const steps = ['control-h', 'row-h', 'card-p', 'page-gutter'];
    const missing = steps.filter((s) => !new RegExp(`--space-${s}\\s*:`).test(text));
    expect(missing, 'density tokens absent from globals.css').toEqual([]);
  });

  it('renders record identifiers with tabular figures — FR-003', () => {
    expect(css()).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

/**
 * WCAG 1.4.11: a control's boundary needs 3:1 against what surrounds it. `--input` was
 * `#e4ddd1` — 1.35:1 on a card — so every form field in the product was identifiable only by
 * a fill barely different from the card. Found by `design:design-critique`, 2026-09-22.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
function token(name: string): string {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css());
  if (!m) throw new Error(`--${name} is not a six-digit hex`);
  return m[1]!;
}

describe('control boundaries are perceivable (WCAG 1.4.11)', () => {
  it('the input border reaches 3:1 on the card and on the ground', () => {
    expect(contrast(token('input'), token('card'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('input'), token('background'))).toBeGreaterThanOrEqual(3);
  });
});

describe('the theme covers what the ported components actually use', () => {
  const ported = existsSync(UI_DIR);

  it.skipIf(!ported)('every colour utility referenced by a component has a token', () => {
    const text = css();
    const used = new Set<string>();

    for (const file of readdirSync(UI_DIR).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(join(UI_DIR, file), 'utf8');
      // `bg-primary`, `text-muted-foreground`, `border-input`, `ring-ring`, and the
      // `/50` opacity and `dark:`/`hover:` prefixed forms of each.
      for (const m of source.matchAll(
        /(?:^|[\s"'`:])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|accent|caret|shadow)-([a-z]+(?:-[a-z]+)*)/g,
      )) {
        used.add(m[1]);
      }
    }

    // Tailwind's own palette and keywords are not theme tokens — only the semantic roles
    // this theme is responsible for. Anything not in the required list is either built in
    // (`white`, `transparent`, `current`) or a scale colour (`red-500`), neither of which
    // globals.css declares.
    const semantic = [...used].filter((name) =>
      (REQUIRED_COLOUR_ROLES as readonly string[]).includes(name),
    );

    const undefined_ = semantic.filter(
      (name) => !new RegExp(`--color-${name}\\s*:`).test(text),
    );

    expect(undefined_, 'used by a component, absent from the theme').toEqual([]);
    // Guards against the regex silently matching nothing and the test passing vacuously.
    expect(semantic.length).toBeGreaterThan(5);
  });
});
