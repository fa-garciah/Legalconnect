# Contrast Table — 020-design-language (SC-004, FR-012)

**Measured**: 2026-09-23, from the live tokens in `frontend/src/app/globals.css`.
**Method**: WCAG 2.1 relative-luminance contrast, each token resolved through its `var()` chain
to the hex value actually served. Text needs 4.5:1 (3:1 at 24px+); non-text UI boundaries and
focus indicators need 3:1 (WCAG 1.4.11).

| Text / element | On | Used for | Ratio | Needs | Result |
|---|---|---|---|---|---|
| `--foreground` #1a1714 | `--background` #faf8f3 | Body text on the ground | 16.82:1 | 4.5:1 | Pass |
| `--foreground` #1a1714 | `--card` #ffffff | Body text on cards and the form column | 17.85:1 | 4.5:1 | Pass |
| `--foreground` #1a1714 | `--rail` #f3f0e9 | Navigation labels on the rail | 15.68:1 | 4.5:1 | Pass |
| `--muted-foreground` #6e6459 | `--background` #faf8f3 | Secondary text on the ground | 5.45:1 | 4.5:1 | Pass |
| `--muted-foreground` #6e6459 | `--card` #ffffff | Secondary text on cards | 5.78:1 | 4.5:1 | Pass |
| `--muted-foreground` #6e6459 | `--rail` #f3f0e9 | Role label on the rail | 5.08:1 | 4.5:1 | Pass |
| `--muted-foreground` #6e6459 | `--muted` #f3f0e9 | Text on muted fills (voucher folio) | 5.08:1 | 4.5:1 | Pass |
| `--primary-foreground` #faf8f3 | `--primary` #3730a3 | Button labels; sign-in brand panel text | 9.36:1 | 4.5:1 | Pass |
| `--primary` #3730a3 | `--background` #faf8f3 | Brand-coloured text and links on the ground | 9.36:1 | 4.5:1 | Pass |
| `--primary` #3730a3 | `--card` #ffffff | Links and wordmark on cards | 9.93:1 | 4.5:1 | Pass |
| `--accent-foreground` #3730a3 | `--accent` #eef2ff | Active nav item; notices; open-matter badge | 8.88:1 | 4.5:1 | Pass |
| `--accent-warm-foreground` #8a6124 | `--accent-warm-tint` #f6ecdd | Suspended-matter badge; natural-person avatar | 4.71:1 | 4.5:1 | Pass |
| `--accent-warm-foreground` #8a6124 | `--background` #faf8f3 | Mobile positioning line on sign-in | 5.18:1 | 4.5:1 | Pass |
| `--destructive` #b3261e | `--card` #ffffff | Error messages on the form column | 6.54:1 | 4.5:1 | Pass |
| `--destructive-foreground` #faf8f3 | `--destructive` #b3261e | Destructive button labels | 6.16:1 | 4.5:1 | Pass |
| `--accent-warm` #b8843f | `--primary` #3730a3 | Ochre icons and rule on the brand panel (non-text) | 3.03:1 | 3:1 | Pass |
| `--input` #968a77 | `--card` #ffffff | Form-field boundary (WCAG 1.4.11, non-text) | 3.39:1 | 3:1 | Pass |
| `--input` #968a77 | `--background` #faf8f3 | Form-field boundary on the ground (non-text) | 3.19:1 | 3:1 | Pass |
| `--ring` #3730a3 | `--card` #ffffff | Focus ring (WCAG 1.4.11, non-text) | 9.93:1 | 3:1 | Pass |

**Result: 19 pairs, 0 failing.**

## Pairs close to their threshold

- `--accent-warm` on `--primary` is **3.03:1**. It passes only as a NON-TEXT element (icons, the
  rule on the sign-in panel). It must never carry text on indigo; `AuthCard.test.tsx` asserts
  that no panel text uses it.
- `--accent-warm-foreground` on `--accent-warm-tint` is **4.71:1** — passes for text, with little
  margin. Any lightening of either token must re-run this table.

## Corrections this measurement made

`globals.css` recorded two ratios that were wrong (both understated, so no pair was ever
failing): `--muted-foreground` on `--background` was annotated 4.62:1 and measures **5.45:1**;
`--destructive` was annotated 5.94:1 and measures **6.54:1** on a card. The annotations are
corrected in the same change.

## How to re-run

Any change to a colour token re-opens SC-004. The measurement reads the tokens from the file,
so it cannot drift from what ships.
