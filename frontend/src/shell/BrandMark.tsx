/**
 * The product's mark: a classic balance on the brand indigo square.
 *
 * It replaces the plain indigo square the top bar, the drawer and the firm picker each drew on
 * their own, and the ochre dot the authentication screens drew, so they can no longer drift apart.
 *
 * Colours come from tokens, never literals (contracts/design-system.md §3.4): the square is
 * `bg-primary` and the strokes inherit `text-primary-foreground` through `currentColor`. On the
 * indigo panel of the sign-in screens the two swap (`inverted`), so the mark stays visible.
 *
 * Decorative: every place that draws it puts the product name beside it, so it is hidden
 * from assistive technology rather than announced twice.
 */
import { cn } from '@/lib/utils';

export interface BrandMarkProps {
  /** `md` (34px) in the product's bars; `lg` (40px) beside the sign-in screens' larger wordmark. */
  readonly size?: 'md' | 'lg';
  /** Light square and indigo strokes, for drawing on an indigo surface. */
  readonly inverted?: boolean;
  readonly className?: string;
}

export function BrandMark({ size = 'md', inverted = false, className }: BrandMarkProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-testid="brand-mark"
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 'lg' ? 'h-10 w-10 rounded-md' : 'h-8.5 w-8.5 rounded-sm',
        inverted ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg
        className={size === 'lg' ? 'h-6.5 w-6.5' : 'h-5.5 w-5.5'}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Central column and base. */}
        <path d="M12 3v17" />
        <path d="M7 20h10" />
        <path d="M9.5 20a2.5 2.5 0 0 1 5 0" />
        {/* The beam. */}
        <path d="M4.5 7.5c2.2.6 4.5-.8 7.5-.8s5.3 1.4 7.5.8" />
        {/* Left pan. */}
        <path d="M5.5 7.5 3 13.5h5L5.5 7.5Z" />
        <path d="M2.8 13.5a2.8 2.5 0 0 0 5.4 0H2.8Z" />
        {/* Right pan. */}
        <path d="M18.5 7.5 16 13.5h5l-2.5-6Z" />
        <path d="M15.8 13.5a2.8 2.5 0 0 0 5.4 0h-5.4Z" />
      </svg>
    </span>
  );
}
