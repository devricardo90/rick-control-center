/**
 * Typed persistence surface for Project — the root isolation aggregate.
 *
 * Functions take an explicit `PrismaClient` rather than the package
 * singleton so callers (including tests) control which database instance
 * they operate against.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { Prisma } from '@prisma/client'
import type {
  AutonomyPolicy,
  BranchPolicy,
  PrismaClient,
  Project,
  ProjectStatus,
} from '@prisma/client'
import { DuplicateProjectKeyError } from './errors.js'

export type { Project, ProjectStatus, AutonomyPolicy, BranchPolicy }

export interface CreateProjectInput {
  key: string
  name: string
  description?: string
  status?: ProjectStatus
  autonomyPolicy?: AutonomyPolicy
  defaultBranchPolicy?: BranchPolicy
  workspacePath?: string
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function createProject(
  client: PrismaClient,
  input: CreateProjectInput,
): Promise<Project> {
  try {
    return await client.project.create({
      data: {
        key: input.key,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.autonomyPolicy !== undefined ? { autonomyPolicy: input.autonomyPolicy } : {}),
        ...(input.defaultBranchPolicy !== undefined ? { defaultBranchPolicy: input.defaultBranchPolicy } : {}),
        ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
      },
    })
  }
  catch (err: unknown) {
    if (isUniqueConstraintViolation(err)) {
      throw new DuplicateProjectKeyError(input.key)
    }
    throw err
  }
}

export async function findProjectById(
  client: PrismaClient,
  id: string,
): Promise<Project | null> {
  return client.project.findUnique({ where: { id } })
}

export async function findProjectByKey(
  client: PrismaClient,
  key: string,
): Promise<Project | null> {
  return client.project.findUnique({ where: { key } })
}

export async function listProjects(client: PrismaClient): Promise<Project[]> {
  return client.project.findMany({ orderBy: { createdAt: 'asc' } })
}
