"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/*
 * 018/T012 — adjusted from the prototype, which is written against `react-day-picker` v8.
 *
 * v8 does not support React 19 at all (its peer range stops at 18), so pinning to the
 * prototype's version was not available — npm refuses it, and the prototype only ran with
 * it because pnpm ignores peer conflicts. The current version renamed the whole class-name
 * set and replaced the two icon slots:
 *
 *   caption             -> month_caption      table      -> month_grid
 *   nav_button_previous -> button_previous    head_row   -> weekdays
 *   nav_button_next     -> button_next        head_cell  -> weekday
 *   row                 -> week               cell       -> day
 *   day                 -> day_button
 *   day_selected/_today/_outside/... -> selected/today/outside/... (modifier keys)
 *   components.IconLeft / IconRight  -> components.Chevron (one slot, given orientation)
 *
 * Every Tailwind class below is carried over unchanged — this is an API rename, and none
 * of research D1's claim about the styling migration is affected.
 *
 * **No screen in slice 018 renders this.** It is one of the ~37 components Q1 accepted
 * would land without a caller, so the guarantee here is T013's: it mounts and produces
 * DOM. The first slice to build a date picker should expect to revisit the class mapping
 * against a real calendar, which is the one thing a smoke test cannot check.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        ),
        range_end: "day-range-end",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        // One slot now, told which way it points — where v8 had a separate component per
        // direction.
        Chevron: ({ orientation, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" {...iconProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...iconProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
