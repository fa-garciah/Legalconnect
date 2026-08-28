/**
 * T013 — 018/FR-024, SC-012. Every ported component mounts and produces DOM.
 *
 * **What this test is for.** The 49 components in `src/components/ui/` came across from a
 * prototype built on the previous majors of Next, React, Tailwind and several component
 * libraries. Most were copied unmodified. A version gap does not announce itself: a
 * component whose upstream renamed an export or moved a prop throws on mount, and the only
 * way to find that out is to mount it. `tsc` does not — three of these type-checked
 * perfectly while being wrong (see the notes in `calendar.tsx`, `resizable.tsx` and
 * `chart.tsx`), and one of them, `sidebar.tsx`, imported a hook name that did not exist in
 * the prototype either.
 *
 * **Nothing is skipped.** Only about a dozen of these have a caller in this slice; the rest
 * arrive ahead of the screens that will use them (Q1). A skipped component is precisely the
 * one that rots unnoticed until the slice that finally needs it, so each of the 49 is
 * mounted here in the state its upstream examples use — dialogs open, providers wrapped,
 * triggers present.
 *
 * **What it deliberately does not assert.** Appearance. jsdom has no CSS pipeline and no
 * layout, so any assertion about colour, size or position would pass vacuously
 * (contracts/design-system.md §5). Theme coverage is checked as text in
 * `theme-tokens.test.tsx`; how it actually looks is `tests/e2e/`'s job. This file answers
 * one question — does it render at all — and answers it for everything.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart } from 'recharts';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { ChartTouchTooltip } from '@/components/ui/chart-touch-tooltip';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { Toaster } from '@/components/ui/toaster';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** The token a case renders so the assertion can find the component's own output. */
const PROBE = 'PROBE';

/** Present when at least one node carries the probe text. Portals included: `screen` reads `document.body`. */
const byProbe = (): Element | null => screen.queryAllByText(PROBE)[0] ?? null;

/** Present when the component emits an element matching `selector`, wherever it portals to. */
const bySelector =
  (selector: string) =>
  (): Element | null =>
    document.body.querySelector(selector);

/** Present when the component emits an accessible role — for the ones that hold no text. */
const byRole =
  (role: string) =>
  (): Element | null =>
    screen.queryAllByRole(role, { hidden: true })[0] ?? null;

/** A form needs a form context, and the context needs a hook, so this needs a component. */
function FormCase(): ReactElement {
  const form = useForm<{ nombre: string }>({ defaultValues: { nombre: '' } });
  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PROBE}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Nombre o razon social.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

interface Case {
  /** The module under `src/components/ui/`, so a failure names the file to open. */
  readonly module: string;
  readonly node: ReactElement;
  /** What the component itself must have produced. Never satisfied by a wrapper. */
  readonly present: () => Element | null;
}

const CASES: readonly Case[] = [
  {
    module: 'accordion',
    node: (
      <Accordion type="single" collapsible defaultValue="a">
        <AccordionItem value="a">
          <AccordionTrigger>{PROBE}</AccordionTrigger>
          <AccordionContent>Contenido</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
    present: byProbe,
  },
  {
    module: 'alert-dialog',
    node: (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{PROBE}</AlertDialogTitle>
            <AlertDialogDescription>Desea continuar</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    present: byProbe,
  },
  {
    module: 'alert',
    node: (
      <Alert>
        <AlertTitle>{PROBE}</AlertTitle>
        <AlertDescription>Mensaje.</AlertDescription>
      </Alert>
    ),
    present: byProbe,
  },
  {
    module: 'aspect-ratio',
    node: (
      <AspectRatio ratio={16 / 9}>
        <span>{PROBE}</span>
      </AspectRatio>
    ),
    present: byProbe,
  },
  {
    module: 'avatar',
    node: (
      <Avatar>
        <AvatarFallback>{PROBE}</AvatarFallback>
      </Avatar>
    ),
    present: byProbe,
  },
  { module: 'badge', node: <Badge>{PROBE}</Badge>, present: byProbe },
  {
    module: 'breadcrumb',
    node: (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{PROBE}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
    present: byProbe,
  },
  { module: 'button', node: <Button>{PROBE}</Button>, present: byProbe },
  {
    // No text of its own: react-day-picker renders the month as a grid.
    module: 'calendar',
    node: <Calendar mode="single" />,
    present: byRole('grid'),
  },
  {
    module: 'card',
    node: (
      <Card>
        <CardHeader>
          <CardTitle>{PROBE}</CardTitle>
          <CardDescription>Descripcion.</CardDescription>
        </CardHeader>
        <CardContent>Contenido</CardContent>
        <CardFooter>Pie</CardFooter>
      </Card>
    ),
    present: byProbe,
  },
  {
    module: 'carousel',
    node: (
      <Carousel>
        <CarouselContent>
          <CarouselItem>{PROBE}</CarouselItem>
          <CarouselItem>Segundo</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    ),
    present: byProbe,
  },
  {
    module: 'chart-touch-tooltip',
    node: <ChartTouchTooltip active label="Enero" payload={[{ color: '#3730a3', name: PROBE, value: 4 }]} />,
    present: byProbe,
  },
  {
    // The container is the part that must mount; the recharts surface needs real layout,
    // which jsdom does not have, so only the wrapper is asserted on.
    module: 'chart',
    node: (
      <ChartContainer config={{ casos: { label: PROBE, color: '#3730a3' } }}>
        <BarChart data={[{ mes: 'Ene', casos: 4 }]}>
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="casos" />
        </BarChart>
      </ChartContainer>
    ),
    present: bySelector('[data-chart]'),
  },
  { module: 'checkbox', node: <Checkbox />, present: byRole('checkbox') },
  {
    module: 'collapsible',
    node: (
      <Collapsible open>
        <CollapsibleTrigger>{PROBE}</CollapsibleTrigger>
        <CollapsibleContent>Contenido</CollapsibleContent>
      </Collapsible>
    ),
    present: byProbe,
  },
  {
    module: 'command',
    node: (
      <Command>
        <CommandInput placeholder="Buscar" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Acciones">
            <CommandItem>
              {PROBE}
              <CommandShortcut>Ctrl K</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </Command>
    ),
    present: byProbe,
  },
  {
    // Opening needs a real right-click with coordinates; the trigger is the component's
    // own DOM and is enough to prove the module mounts.
    module: 'context-menu',
    node: (
      <ContextMenu>
        <ContextMenuTrigger>{PROBE}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Editar</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
    present: byProbe,
  },
  {
    module: 'dialog',
    node: (
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{PROBE}</DialogTitle>
            <DialogDescription>Descripcion.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    present: byProbe,
  },
  {
    module: 'drawer',
    node: (
      <Drawer open>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{PROBE}</DrawerTitle>
            <DrawerDescription>Descripcion.</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button>Cerrar</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    ),
    present: byProbe,
  },
  {
    module: 'dropdown-menu',
    node: (
      <DropdownMenu open>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{PROBE}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    present: byProbe,
  },
  { module: 'form', node: <FormCase />, present: byProbe },
  {
    module: 'hover-card',
    node: (
      <HoverCard open>
        <HoverCardTrigger>{PROBE}</HoverCardTrigger>
        <HoverCardContent>Detalle</HoverCardContent>
      </HoverCard>
    ),
    present: byProbe,
  },
  {
    module: 'input-otp',
    node: (
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    ),
    present: bySelector('input'),
  },
  { module: 'input', node: <Input placeholder={PROBE} />, present: byRole('textbox') },
  { module: 'label', node: <Label>{PROBE}</Label>, present: byProbe },
  {
    module: 'menubar',
    node: (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>{PROBE}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Nuevo</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
    present: byProbe,
  },
  {
    module: 'navigation-menu',
    node: (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/clientes">{PROBE}</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ),
    present: byProbe,
  },
  {
    module: 'pagination',
    node: (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">{PROBE}</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
    present: byProbe,
  },
  {
    module: 'popover',
    node: (
      <Popover open>
        <PopoverTrigger>Abrir</PopoverTrigger>
        <PopoverContent>{PROBE}</PopoverContent>
      </Popover>
    ),
    present: byProbe,
  },
  { module: 'progress', node: <Progress value={40} />, present: byRole('progressbar') },
  {
    module: 'radio-group',
    node: (
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>
    ),
    present: byRole('radio'),
  },
  {
    module: 'resizable',
    node: (
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={50}>{PROBE}</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>Derecha</ResizablePanel>
      </ResizablePanelGroup>
    ),
    present: byProbe,
  },
  { module: 'scroll-area', node: <ScrollArea>{PROBE}</ScrollArea>, present: byProbe },
  {
    // Closed: opening the list needs pointer geometry jsdom cannot supply. The trigger and
    // its placeholder are the component's own DOM.
    module: 'select',
    node: (
      <Select>
        <SelectTrigger>
          <SelectValue placeholder={PROBE} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="activo">Activo</SelectItem>
        </SelectContent>
      </Select>
    ),
    present: byProbe,
  },
  { module: 'separator', node: <Separator />, present: bySelector('[data-orientation="horizontal"]') },
  {
    module: 'sheet',
    node: (
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{PROBE}</SheetTitle>
            <SheetDescription>Descripcion.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    ),
    present: byProbe,
  },
  {
    module: 'sidebar',
    node: (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{PROBE}</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>Clientes</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    ),
    present: byProbe,
  },
  {
    module: 'skeleton',
    node: <Skeleton data-testid="probe-skeleton" />,
    present: bySelector('[data-testid="probe-skeleton"]'),
  },
  { module: 'slider', node: <Slider defaultValue={[40]} />, present: byRole('slider') },
  { module: 'sonner', node: <SonnerToaster />, present: bySelector('[data-sonner-toaster], section[aria-label]') },
  { module: 'switch', node: <Switch />, present: byRole('switch') },
  {
    module: 'table',
    node: (
      <Table>
        <TableCaption>Directorio</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{PROBE}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Acme</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ),
    present: byProbe,
  },
  {
    module: 'tabs',
    node: (
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">{PROBE}</TabsTrigger>
          <TabsTrigger value="b">Otro</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Contenido</TabsContent>
      </Tabs>
    ),
    present: byProbe,
  },
  { module: 'textarea', node: <Textarea placeholder={PROBE} />, present: byRole('textbox') },
  {
    module: 'toast',
    node: (
      <ToastProvider>
        <Toast open>
          <ToastTitle>{PROBE}</ToastTitle>
          <ToastDescription>Guardado.</ToastDescription>
          <ToastAction altText="Deshacer">Deshacer</ToastAction>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>
    ),
    present: byProbe,
  },
  {
    // Renders the live toast region, which is empty until something is dispatched — the
    // region itself is the component's output.
    module: 'toaster',
    node: <Toaster />,
    present: bySelector('ol'),
  },
  {
    module: 'toggle-group',
    node: (
      <ToggleGroup type="single">
        <ToggleGroupItem value="a">{PROBE}</ToggleGroupItem>
      </ToggleGroup>
    ),
    present: byProbe,
  },
  { module: 'toggle', node: <Toggle>{PROBE}</Toggle>, present: byProbe },
  {
    module: 'tooltip',
    node: (
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Abrir</TooltipTrigger>
          <TooltipContent>{PROBE}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    present: byProbe,
  },
];

describe('every ported component mounts', () => {
  it.each(CASES.map((c) => [c.module, c] as const))('%s renders', (_module, testCase) => {
    expect(() => render(testCase.node)).not.toThrow();
    expect(testCase.present()).not.toBeNull();
  });
});

describe('the smoke test covers the library', () => {
  it('has a case for every module in src/components/ui', async () => {
    // Guards the thing a per-component test cannot: a component added later and never
    // mounted here. Reading the directory rather than a hand-kept list means the next
    // component to arrive fails this until someone writes its case.
    const { readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const modules = readdirSync(join(process.cwd(), 'src/components/ui'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .sort();
    const covered = [...CASES.map((c) => c.module)].sort();

    expect(covered, 'a component in src/components/ui with no smoke case').toEqual(modules);
  });
});
