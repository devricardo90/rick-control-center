/**
 * Persistence types for the canonical Execution Contract schema
 * (NDERCC-37 / RIC-S3-02 / P0-040).
 *
 * P0-040 exposes the generated row types so later work can persist and read
 * the schema through the database boundary. It intentionally exposes no
 * constructor, generator, completeness decision, lifecycle transition or
 * hashing operation; those belong to P0-041 through P0-043.
 */
export type {
  ExecutionContract as PersistedExecutionContract,
  ExecutionContractTask as PersistedExecutionContractTask,
} from '@prisma/client'
