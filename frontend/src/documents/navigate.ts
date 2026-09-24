/**
 * 021. Sends the browser to a signed download URL.
 *
 * Its own module so component tests can replace it: jsdom cannot navigate. The URL carries
 * `Content-Disposition: attachment` (Decision 4), so the page stays where it is and the browser
 * saves the file under its original name.
 */
export function openDownload(url: string): void {
  window.location.assign(url);
}
