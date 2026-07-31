/**
 * Public surface of the @rick/database package.
 *
 * Re-exports the PrismaClient singleton and the health-check utility.
 * Domain models will be added in NDERCC-5.
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
export { prisma } from './client.js'
export type { DatabaseHealthResult } from './health.js'
export { checkDatabaseHealth } from './health.js'
