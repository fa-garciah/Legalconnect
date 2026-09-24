/**
 * 014. `/configuracion` — one page, three tabs (Decision 4).
 *
 * Tabs rather than three routes: the three are one job (who is in the firm, what they are
 * called, what their role allows), and an administrator moves between them constantly.
 */
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Archetype } from '@/session/types';
import { UsersTab } from './components/UsersTab';
import { RolesTab } from './components/RolesTab';
import { PermissionsMatrixView } from './components/PermissionsMatrixView';
import { DocumentCategoriesTab } from './components/DocumentCategoriesTab';

export interface ConfiguracionViewProps {
  readonly archetype: Archetype;
}

export function ConfiguracionView({ archetype }: ConfiguracionViewProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6" aria-labelledby="configuracion-heading">
      <div className="flex flex-col gap-1">
        <h1 id="configuracion-heading" className="font-display text-display font-semibold tracking-tight">
          Configuración del despacho
        </h1>
        <p className="text-muted-foreground">
          Personas, cargos y lo que cada rol puede hacer.
        </p>
      </div>

      <Tabs defaultValue="usuarios">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="usuarios">Usuarios e invitaciones</TabsTrigger>
          <TabsTrigger value="cargos">Cargos y roles</TabsTrigger>
          <TabsTrigger value="documentos">Categorías de documentos</TabsTrigger>
          <TabsTrigger value="matriz">Matriz de permisos</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios" className="mt-6">
          <UsersTab archetype={archetype} />
        </TabsContent>
        <TabsContent value="cargos" className="mt-6">
          <RolesTab archetype={archetype} />
        </TabsContent>
        {/* 021 Decision 6. */}
        <TabsContent value="documentos" className="mt-6">
          <DocumentCategoriesTab archetype={archetype} />
        </TabsContent>
        <TabsContent value="matriz" className="mt-6">
          <PermissionsMatrixView />
        </TabsContent>
      </Tabs>
    </section>
  );
}
