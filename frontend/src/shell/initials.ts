/**
 * Initials for the avatar. Two at most; one when there is only one word.
 *
 * Moved out of `Sidebar.tsx` when the top bar's account menu became its second reader.
 *
 * TAKES `string | undefined` BECAUSE THE VALUE COMES OFF THE NETWORK. A missing name must
 * degrade to a placeholder, never take the whole shell down (see the history in `Sidebar.tsx`).
 */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
