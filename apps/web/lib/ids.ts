const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route segments are user input. A segment that is not a uuid can never match a
 * uuid column, and letting it reach Postgres turns a "no such page" into a
 * database error, so dynamic routes check the shape first and render a 404.
 */
export function isUuidId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
