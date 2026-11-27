/**
 * The App Router shows this while a page's server render is on its way — between clicking a
 * section in the top bar and that section arriving. Without it the previous page stayed on
 * screen with no sign that anything was happening.
 */
import { BrandSplash } from '../feedback/BrandSplash';

export default function Loading(): React.JSX.Element {
  return <BrandSplash />;
}
