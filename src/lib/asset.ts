/**
 * Address of a file in /public. Paths in the data start with "/" (the site root); when the app
 * is served from a sub-path, such as a GitHub Pages project site, they must start there instead.
 */
export function asset(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? `${import.meta.env.BASE_URL}${path.slice(1)}` : path;
}
