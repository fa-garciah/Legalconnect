# Contrast Table — 015-kpi-dashboard (the chart tokens)

**Measured**: 2026-09-26, from the live tokens in `frontend/src/app/globals.css`.
**Method**: identical to [`020`'s table](../020-design-language/contrast.md) — WCAG 2.1
relative-luminance contrast, each token resolved through its `var()` chain to the hex actually
served. This slice adds the first data-visualisation colours the product has ever had, so they
are measured here rather than folded into `020`'s table, which records what `020` decided.

A bar, a line and a dot are **non-text graphical objects required to understand the content**,
so the threshold is 3:1 against the surface behind them (WCAG 1.4.11), not 4.5:1.

## Every new token, against both surfaces it is drawn on

| Token | Used by | On `--card` #ffffff | On `--background` #faf8f3 | Needs | Result |
|---|---|---|---|---|---|
| `--chart-1` #3730a3 | Bars: matters per responsible | 9.93:1 | 9.36:1 | 3:1 | Pass |
| `--chart-2` #5b53c4 | Line: resolution-time trend | 6.04:1 | 5.69:1 | 3:1 | Pass |
| `--chart-positive` #2f6f4f | Bars: success rate by type | 5.99:1 | 5.64:1 | 3:1 | Pass |

**Result: 6 pairs, 0 failing**, and the tightest is 5.64:1 — nearly twice the threshold.

## Three tokens, because there are three series

An earlier draft of this table measured **seven** tokens: a five-step categorical scale plus a
red/green semantic pair. Four of the seven had no user anywhere in the product, and the draft
documented a sixth-series fallback that did not exist in any component. They were removed rather
than described.

None of this slice's three charts is multi-series. Each draws **one** measure, and its categories
are told apart by their own axis labels and by the accessible table underneath — not by hue. A
scale of five steps would have been a palette written for charts nobody had asked for, and every
one of its pairs would have needed re-measuring whenever `020`'s families moved.

The one genuinely close pair that scale contained is worth recording for whoever adds it back:
`--accent-warm` #b8843f on `--background` measures **3.09:1**, nine hundredths above the
threshold. It is the only warm hue the product has, so a categorical scale will want it — and it
will be the first pair to break if either token moves.

## Colour carries no information on this screen

Whatever palette a later slice chooses, this must stay true, and on `/kpis` it is (WCAG 1.4.1):

- every bar is labelled on its own axis, by position or by matter type;
- every chart is followed by a real `<table>` with a caption carrying the same numbers (FR-012);
- no figure is coloured good or bad. A low success rate is a percentage beside its sample size,
  which is usually the more important of the two — red would drown it. That is also why there is
  no `--chart-negative`.

A reader who cannot distinguish the hues loses nothing, because the hues say nothing.
