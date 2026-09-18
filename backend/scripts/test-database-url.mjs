/**
 * CI (GitHub Actions) uses localhost:5432; local docker-compose maps postgres_test to 5434.
 * @see backend/docker-compose.yml
 * @see backend/README.md
 */
export const LOCAL_TEST_DATABASE_URL =
  'postgresql+psycopg://erp:erp@localhost:5434/erp_test'

export function resolveTestDatabaseUrl() {
  return process.env.DATABASE_URL || LOCAL_TEST_DATABASE_URL
}
