/**
 * Name to component, resolved on the client because the registry that names them is read on
 * the server. See `NavigationIconName` in `navigation-items.ts`.
 *
 * Shared by the left rail (`NavigationMenu`) and the top bar (`TopNavigation`,
 * `MobileNavigation`), so the two layouts cannot draw a section with different icons.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Calendar,
  Clock,
  CreditCard,
  Database,
  FileText,
  Home,
  Settings,
  Users,
} from 'lucide-react';
import type { NavigationIconName } from './navigation-items';

export const NAVIGATION_ICONS: Readonly<Record<NavigationIconName, LucideIcon>> = {
  home: Home,
  briefcase: Briefcase,
  users: Users,
  'file-text': FileText,
  calendar: Calendar,
  'bar-chart': BarChart3,
  database: Database,
  clock: Clock,
  'credit-card': CreditCard,
  settings: Settings,
};
