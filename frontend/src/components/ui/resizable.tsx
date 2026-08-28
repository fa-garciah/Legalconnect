"use client"

import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

/*
 * 018/T012, T014 — adjusted from the prototype, which is written against the previous
 * major version of `react-resizable-panels`. That version does not support React 19, so
 * pinning to it was not an option. Three things moved:
 *
 *   PanelGroup                 -> Group
 *   PanelResizeHandle          -> Separator
 *   <PanelGroup direction=...> -> <Group orientation=...>
 *
 * `Panel` is unchanged.
 *
 * The fourth change is the one worth reading. The old version stamped a
 * `data-panel-group-direction` attribute onto the group AND onto every handle, and the
 * prototype's vertical styling hangs entirely off that attribute — seven
 * `data-[panel-group-direction=vertical]:` classes on the handle alone. The current
 * version does not emit it at all, so a straight rename would have type-checked, mounted,
 * passed the smoke test, and then laid a vertical group out horizontally. Exactly the
 * silent-wrongness this slice's tests exist to catch, and exactly what neither `tsc` nor a
 * mount check can see.
 *
 * So the group stamps the attribute itself, and the handle's classes — which are on a
 * sibling, not on the group — read it from their ancestor instead of from themselves.
 * Every class is the prototype's; only the selector they hang off changed, and no part of
 * research D1's claim about the styling migration is affected.
 *
 * **No screen in slice 018 renders this.** The guarantee here is T013's: it mounts. The
 * first slice to build a split view should verify the vertical case in a real browser,
 * which is the one thing a jsdom smoke test cannot do.
 */

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    orientation={orientation}
    // Re-published for the styling below, which the library no longer provides.
    data-panel-group-direction={orientation}
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      // Vertical group: read the orientation off the ancestor group, since the handle no
      // longer carries it. Same declarations the prototype had, same breakpoint-free
      // behaviour — only the selector prefix differs.
      "[[data-panel-group-direction=vertical]_&]:h-px [[data-panel-group-direction=vertical]_&]:w-full [[data-panel-group-direction=vertical]_&]:after:left-0 [[data-panel-group-direction=vertical]_&]:after:h-1 [[data-panel-group-direction=vertical]_&]:after:w-full [[data-panel-group-direction=vertical]_&]:after:-translate-y-1/2 [[data-panel-group-direction=vertical]_&]:after:translate-x-0 [[data-panel-group-direction=vertical]_&>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
