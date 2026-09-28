/**
 * CI injects its own URL. Use IPv4 locally because Windows can spend several
 * seconds attempting ::1 before falling back to the IPv4-only test service.
 * @see backend/docker-compose.yml
 * @see backend/README.md
 */
export const LOCAL_TEST_DATABASE_URL =
  'postgresql+psycopg://erp:erp@127.0.0.1:5434/erp_test'

export function resolveTestDatabaseUrl() {
  return process.env.DATABASE_URL || LOCAL_TEST_DATABASE_URL
}
