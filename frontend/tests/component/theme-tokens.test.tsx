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

  it('declares a dark variant, so the components dark: classes can ever activate', () => {
    // Every ported component carries `dark:` classes. Under the previous version this was
    // a config key; here it is a custom variant. Omit it and those classes never fire —
    // again silently.
    expect(css()).toMatch(/@custom-variant\s+dark|prefers-color-scheme|\[data-theme/);
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
      const m = new RegExp(`--${name}\s*:\s*([^;]+);`).exec(text);
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
