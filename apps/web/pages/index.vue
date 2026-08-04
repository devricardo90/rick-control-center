<script setup lang="ts">
/**
 * Minimal authenticated project registry — Sprint 0 scope. List, create,
 * and select a project. No edit, archive, delete, or external
 * integrations here (see NDERCC-7 exclusions).
 */
import type { PublicProject } from '../server/utils/public-project'

interface CreateProjectFormState {
  key: string
  name: string
  description: string
}

// SSR runs this as a server-to-server sub-request to /api/projects, which
// the auth middleware protects independently of the outer page request —
// the incoming session cookie must be forwarded explicitly or that
// sub-request renders as unauthenticated.
const forwardedHeaders = useRequestHeaders(['cookie'])
const { data: projects, pending, error: loadError, refresh } = await useFetch<PublicProject[]>('/api/projects', {
  headers: forwardedHeaders,
})

const selectedProjectId = ref<string | null>(null)
const isCreating = ref(false)
const createErrorMessage = ref('')

const form = reactive<CreateProjectFormState>({ key: '', name: '', description: '' })

const projectList = computed(() => projects.value ?? [])
const viewState = computed(() =>
  resolveProjectListViewState({
    pending: pending.value,
    hasError: loadError.value !== null,
    projectCount: projectList.value.length,
  }),
)
const selectedProject = computed(() => findSelectedProject(projectList.value, selectedProjectId.value))

function selectProject(projectId: string): void {
  selectedProjectId.value = projectId
}

async function handleCreate(): Promise<void> {
  createErrorMessage.value = ''
  isCreating.value = true

  try {
    const created = await $fetch<PublicProject>('/api/projects', {
      method: 'POST',
      body: {
        key: form.key,
        name: form.name,
        ...(form.description.length > 0 ? { description: form.description } : {}),
      },
    })

    await refresh()
    selectedProjectId.value = created.id
    form.key = ''
    form.name = ''
    form.description = ''
  }
  catch (err: unknown) {
    createErrorMessage.value = extractSafeErrorMessage(err, 'Unable to create the project. Please try again.')
  }
  finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-screen-xl px-6 py-10">
    <div class="mb-6 flex flex-col gap-1">
      <h1 class="font-sans text-2xl font-semibold text-foreground">
        Projects
      </h1>
      <p class="text-sm text-muted-foreground">
        <template v-if="selectedProject">
          Selected:
          <span class="font-medium text-foreground">{{ selectedProject.name }}</span>
          <span class="font-mono text-xs text-muted-foreground">({{ selectedProject.key }})</span>
        </template>
        <template v-else>
          No project selected.
        </template>
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section
        aria-label="Project list"
        class="rounded-lg border border-border bg-background"
      >
        <div
          v-if="viewState === 'loading'"
          class="p-6 text-sm text-muted-foreground"
        >
          Loading projects…
        </div>

        <div
          v-else-if="viewState === 'server-error'"
          class="p-6 text-sm text-red-500"
        >
          Unable to load projects. Please try again.
        </div>

        <div
          v-else-if="viewState === 'empty'"
          class="p-6 text-sm text-muted-foreground"
        >
          No projects yet. Create your first project to get started.
        </div>

        <ul
          v-else
          class="divide-y divide-border"
        >
          <li
            v-for="project in projectList"
            :key="project.id"
          >
            <button
              type="button"
              :aria-current="project.id === selectedProjectId ? 'true' : undefined"
              class="flex w-full flex-col gap-0.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              :class="project.id === selectedProjectId ? 'bg-brand-50 dark:bg-brand-950' : 'hover:bg-muted'"
              @click="selectProject(project.id)"
            >
              <span class="text-sm font-medium text-foreground">{{ project.name }}</span>
              <span class="font-mono text-xs text-muted-foreground">{{ project.key }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section
        aria-label="Create project"
        class="h-fit rounded-lg border border-border bg-background p-4"
      >
        <h2 class="mb-4 font-sans text-sm font-semibold text-foreground">
          Create project
        </h2>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="handleCreate"
        >
          <div class="flex flex-col gap-1">
            <label
              for="project-key"
              class="text-sm text-muted-foreground"
            >Key</label>
            <input
              id="project-key"
              v-model="form.key"
              type="text"
              required
              class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              for="project-name"
              class="text-sm text-muted-foreground"
            >Name</label>
            <input
              id="project-name"
              v-model="form.name"
              type="text"
              required
              class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              for="project-description"
              class="text-sm text-muted-foreground"
            >Description (optional)</label>
            <textarea
              id="project-description"
              v-model="form.description"
              rows="3"
              class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <p
            v-if="createErrorMessage"
            class="text-sm text-red-500"
          >
            {{ createErrorMessage }}
          </p>

          <button
            type="submit"
            :disabled="isCreating"
            class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {{ isCreating ? 'Creating…' : 'Create project' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
