"use client"

import type * as React from "react"
import { cn } from "@/lib/utils"

/*
 * 018/T014 — NOTE, and the one exception to research D1.
 *
 * D1's claim is that the ported components reference only theme tokens, which is why the
 * whole styling migration reduced to `globals.css`. That holds for 48 of the 49. This one
 * hardcodes `bg-white`, `border-gray-200`, `text-gray-600/800/900` — palette colours, not
 * roles — so it ignores the theme and renders light-on-light under `.dark`.
 *
 * Left as the prototype had it deliberately: correcting it changes what the component
 * looks like, and nothing in this slice renders it (Q1). Whichever slice first puts a
 * chart on a screen should map these to `bg-popover`, `border-border`,
 * `text-muted-foreground` and `text-foreground` and check the result in a browser.
 */

/**
 * The subset of a recharts payload entry the chart components read.
 *
 * 018/T014 — the prototype typed this `any[]`, which this repo's lint rejects. It lives in
 * this module rather than in `chart.tsx` only because `chart.tsx` imports this file at
 * runtime: putting the shared type in the leaf keeps the dependency one-directional.
 * `chart.tsx` re-exports it, so callers can keep importing it from there.
 */
export interface ChartPayloadItem {
  readonly dataKey?: string | number
  readonly name?: string | number
  readonly value?: unknown
  readonly color?: string
  readonly payload?: Record<string, unknown>
  readonly [key: string]: unknown
}

/**
 * How a caller renders one payload entry's value. Recharts calls a formatter with five
 * arguments; declaring all five here is what lets the desktop and touch tooltips share a
 * single `formatter` prop instead of casting between two shapes at the boundary.
 */
export type ChartValueFormatter = (
  value: unknown,
  name: unknown,
  item: ChartPayloadItem,
  index: number,
  raw: unknown,
) => React.ReactNode

/** How a caller renders the tooltip's heading. */
export type ChartLabelFormatter = (label: unknown, payload: ChartPayloadItem[]) => React.ReactNode

interface ChartTouchTooltipProps {
  active?: boolean
  payload?: ChartPayloadItem[]
  label?: string
  labelFormatter?: ChartLabelFormatter
  formatter?: ChartValueFormatter
  className?: string
  labelClassName?: string
}

export function ChartTouchTooltip({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  className,
  labelClassName,
}: ChartTouchTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  return (
    <div className={cn("min-w-[150px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg", className)}>
      {label && (
        <div className={cn("mb-2 font-medium text-gray-800", labelClassName)}>
          {labelFormatter ? labelFormatter(label, payload) : label}
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-sm text-gray-600">{entry.name}</span>
            </div>
            <span className="font-medium text-gray-900">
              {formatter
                ? formatter(entry.value, entry.name, entry, index, entry.payload)
                : typeof entry.value === "number"
                  ? entry.value.toLocaleString()
                  : String(entry.value ?? "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
