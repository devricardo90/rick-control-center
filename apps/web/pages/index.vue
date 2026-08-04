<script setup lang="ts">
/**
 * Minimal authenticated project registry — list, create, select, edit
 * settings, and manage lifecycle (pause/reactivate/archive). No project
 * key editing, physical deletion, or unarchive/restore (see NDERCC-10
 * exclusions).
 *
 * `AutonomyPolicy`/`BranchPolicy` option lists are duplicated here as
 * plain literals rather than imported from `@rick/database`: that package
 * pulls in the Prisma client and Postgres driver, which must never enter
 * the browser bundle. This is a real client/server runtime boundary, not
 * a logic duplication to avoid — see `apps/web/tests/utils/project-enum-options.test.ts`
 * for the test that keeps these literals from silently drifting out of
 * sync with the actual Prisma enums.
 */
import type { PublicProject } from '../server/utils/public-project'
import { AUTONOMY_POLICY_OPTIONS, BRANCH_POLICY_OPTIONS } from '../utils/project-enum-options'

interface CreateProjectFormState {
  key: string
  name: string
  description: string
}

interface SettingsFormState {
  name: string
  description: string
  autonomyPolicy: string
  defaultBranchPolicy: string
  workspacePath: string
}

type LifecycleAction = 'PAUSE' | 'REACTIVATE' | 'ARCHIVE'

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
const createForm = reactive<CreateProjectFormState>({ key: '', name: '', description: '' })

const projectList = computed(() => projects.value ?? [])
const viewState = computed(() =>
  resolveProjectListViewState({
    pending: pending.value,
    hasError: loadError.value !== null,
    projectCount: projectList.value.length,
  }),
)
const selectedProject = computed(() => findSelectedProject(projectList.value, selectedProjectId.value))

function selectProject(project: PublicProject): void {
  if (!isSelectableProject(project)) {
    return
  }
  selectedProjectId.value = project.id
}

// Defense in depth: even if the list ever changes under us in a way that
// makes the current selection archived, drop the selection immediately —
// an archived project must never remain the active context.
watch(projectList, (list) => {
  const current = findSelectedProject(list, selectedProjectId.value)
  if (current && !isSelectableProject(current)) {
    selectedProjectId.value = null
  }
})

async function handleCreate(): Promise<void> {
  createErrorMessage.value = ''
  isCreating.value = true

  try {
    const created = await $fetch<PublicProject>('/api/projects', {
      method: 'POST',
      body: {
        key: createForm.key,
        name: createForm.name,
        ...(createForm.description.length > 0 ? { description: createForm.description } : {}),
      },
    })

    await refresh()
    selectedProjectId.value = created.id
    createForm.key = ''
    createForm.name = ''
    createForm.description = ''
  }
  catch (err: unknown) {
    createErrorMessage.value = extractSafeErrorMessage(err, 'Unable to create the project. Please try again.')
  }
  finally {
    isCreating.value = false
  }
}

// ── Settings ────────────────────────────────────────────────────────────

const settingsProject = ref<PublicProject | null>(null)
const settingsLoading = ref(false)
const settingsLoadError = ref(false)
const settingsSaving = ref(false)
const settingsSaveSuccess = ref(false)
const settingsError = ref('')
const lifecyclePending = ref(false)
const lifecycleError = ref('')

const settingsForm = reactive<SettingsFormState>({
  name: '',
  description: '',
  autonomyPolicy: '',
  defaultBranchPolicy: '',
  workspacePath: '',
})

function applySettingsProject(project: PublicProject): void {
  settingsProject.value = project
  settingsForm.name = project.name
  settingsForm.description = project.description ?? ''
  settingsForm.autonomyPolicy = project.autonomyPolicy
  settingsForm.defaultBranchPolicy = project.defaultBranchPolicy
  settingsForm.workspacePath = project.workspacePath ?? ''
}

async function loadSettings(projectId: string): Promise<void> {
  settingsLoading.value = true
  settingsLoadError.value = false
  settingsSaveSuccess.value = false
  settingsError.value = ''
  lifecycleError.value = ''

  try {
    const project = await $fetch<PublicProject>(`/api/projects/${projectId}`)
    applySettingsProject(project)
  }
  catch {
    settingsLoadError.value = true
    settingsProject.value = null
  }
  finally {
    settingsLoading.value = false
  }
}

watch(selectedProjectId, (id) => {
  if (id === null) {
    settingsProject.value = null
    return
  }
  void loadSettings(id)
}, { immediate: true })

const isSettingsDirty = computed(() => {
  const project = settingsProject.value
  if (!project) {
    return false
  }
  return (
    settingsForm.name !== project.name
    || settingsForm.description !== (project.description ?? '')
    || settingsForm.autonomyPolicy !== project.autonomyPolicy
    || settingsForm.defaultBranchPolicy !== project.defaultBranchPolicy
    || settingsForm.workspacePath !== (project.workspacePath ?? '')
  )
})

async function handleSaveSettings(): Promise<void> {
  const project = settingsProject.value
  if (!project) {
    return
  }
  if (settingsForm.name.trim().length === 0) {
    settingsError.value = 'Name is required.'
    return
  }

  settingsSaving.value = true
  settingsError.value = ''
  settingsSaveSuccess.value = false

  try {
    const updated = await $fetch<PublicProject>(`/api/projects/${project.id}`, {
      method: 'PATCH',
      body: {
        name: settingsForm.name,
        description: settingsForm.description,
        autonomyPolicy: settingsForm.autonomyPolicy,
        defaultBranchPolicy: settingsForm.defaultBranchPolicy,
        workspacePath: settingsForm.workspacePath,
      },
    })
    applySettingsProject(updated)
    settingsSaveSuccess.value = true
    await refresh()
  }
  catch (err: unknown) {
    settingsError.value = extractSafeErrorMessage(err, 'Unable to save settings. Please try again.')
  }
  finally {
    settingsSaving.value = false
  }
}

async function runLifecycleAction(action: LifecycleAction): Promise<void> {
  const project = settingsProject.value
  if (!project) {
    return
  }

  lifecyclePending.value = true
  lifecycleError.value = ''

  try {
    const updated = await $fetch<PublicProject>(`/api/projects/${project.id}/lifecycle`, {
      method: 'POST',
      body: { action },
    })

    await refresh()

    if (updated.status === 'ARCHIVED') {
      selectedProjectId.value = null
      settingsProject.value = null
    }
    else {
      applySettingsProject(updated)
    }
  }
  catch (err: unknown) {
    lifecycleError.value = extractSafeErrorMessage(err, 'Unable to update project status. Please try again.')
  }
  finally {
    lifecyclePending.value = false
  }
}

function handlePause(): void {
  void runLifecycleAction('PAUSE')
}

function handleReactivate(): void {
  void runLifecycleAction('REACTIVATE')
}

function handleArchive(): void {
  const confirmed = window.confirm(
    'Archive this project? Archived projects become read-only and cannot be restored.',
  )
  if (!confirmed) {
    return
  }
  void runLifecycleAction('ARCHIVE')
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

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            <div
              v-if="!isSelectableProject(project)"
              aria-disabled="true"
              class="flex w-full flex-col gap-0.5 px-4 py-3 text-left opacity-60"
            >
              <span class="flex items-center gap-2">
                <span class="text-sm font-medium text-foreground">{{ project.name }}</span>
                <span class="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Archived
                </span>
              </span>
              <span class="font-mono text-xs text-muted-foreground">{{ project.key }}</span>
            </div>

            <button
              v-else
              type="button"
              :aria-current="project.id === selectedProjectId ? 'true' : undefined"
              class="flex w-full flex-col gap-0.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              :class="project.id === selectedProjectId ? 'bg-brand-50 dark:bg-brand-950' : 'hover:bg-muted'"
              @click="selectProject(project)"
            >
              <span class="flex items-center gap-2">
                <span class="text-sm font-medium text-foreground">{{ project.name }}</span>
                <span class="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {{ project.status }}
                </span>
              </span>
              <span class="font-mono text-xs text-muted-foreground">{{ project.key }}</span>
            </button>
          </li>
        </ul>
      </section>

      <div class="flex flex-col gap-6">
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
                v-model="createForm.key"
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
                v-model="createForm.name"
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
                v-model="createForm.description"
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

        <section
          v-if="selectedProjectId !== null"
          aria-label="Project settings"
          class="h-fit rounded-lg border border-border bg-background p-4"
        >
          <h2 class="mb-4 font-sans text-sm font-semibold text-foreground">
            Settings
          </h2>

          <div
            v-if="settingsLoading"
            class="text-sm text-muted-foreground"
          >
            Loading settings…
          </div>

          <div
            v-else-if="settingsLoadError"
            class="text-sm text-red-500"
          >
            Unable to load project settings. Please try again.
          </div>

          <form
            v-else-if="settingsProject"
            class="flex flex-col gap-4"
            @submit.prevent="handleSaveSettings"
          >
            <div class="flex flex-col gap-1">
              <label
                for="settings-key"
                class="text-sm text-muted-foreground"
              >Project key</label>
              <input
                id="settings-key"
                :value="settingsProject.key"
                type="text"
                readonly
                class="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-muted-foreground"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label
                for="settings-name"
                class="text-sm text-muted-foreground"
              >Name</label>
              <input
                id="settings-name"
                v-model="settingsForm.name"
                type="text"
                required
                :disabled="settingsSaving"
                class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label
                for="settings-description"
                class="text-sm text-muted-foreground"
              >Description</label>
              <textarea
                id="settings-description"
                v-model="settingsForm.description"
                rows="3"
                :disabled="settingsSaving"
                class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <div class="flex flex-col gap-1">
              <label
                for="settings-autonomy-policy"
                class="text-sm text-muted-foreground"
              >Autonomy policy</label>
              <select
                id="settings-autonomy-policy"
                v-model="settingsForm.autonomyPolicy"
                :disabled="settingsSaving"
                class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <option
                  v-for="option in AUTONOMY_POLICY_OPTIONS"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label
                for="settings-branch-policy"
                class="text-sm text-muted-foreground"
              >Default branch policy</label>
              <select
                id="settings-branch-policy"
                v-model="settingsForm.defaultBranchPolicy"
                :disabled="settingsSaving"
                class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <option
                  v-for="option in BRANCH_POLICY_OPTIONS"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label
                for="settings-workspace-path"
                class="text-sm text-muted-foreground"
              >Workspace path</label>
              <input
                id="settings-workspace-path"
                v-model="settingsForm.workspacePath"
                type="text"
                :disabled="settingsSaving"
                class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <p
              v-if="settingsError"
              class="text-sm text-red-500"
            >
              {{ settingsError }}
            </p>
            <p
              v-else-if="settingsSaveSuccess && !isSettingsDirty"
              class="text-sm text-green-600 dark:text-green-500"
            >
              Settings saved.
            </p>
            <p
              v-else-if="isSettingsDirty"
              class="text-sm text-muted-foreground"
            >
              Unsaved changes.
            </p>

            <button
              type="submit"
              :disabled="settingsSaving || !isSettingsDirty"
              class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {{ settingsSaving ? 'Saving…' : 'Save settings' }}
            </button>

            <div class="flex flex-col gap-2 border-t border-border pt-4">
              <p
                v-if="lifecycleError"
                class="text-sm text-red-500"
              >
                {{ lifecycleError }}
              </p>

              <div class="flex gap-2">
                <button
                  v-if="settingsProject.status === 'ACTIVE'"
                  type="button"
                  :disabled="lifecyclePending"
                  class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  @click="handlePause"
                >
                  {{ lifecyclePending ? 'Pausing…' : 'Pause' }}
                </button>

                <button
                  v-if="settingsProject.status === 'PAUSED'"
                  type="button"
                  :disabled="lifecyclePending"
                  class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  @click="handleReactivate"
                >
                  {{ lifecyclePending ? 'Reactivating…' : 'Reactivate' }}
                </button>

                <button
                  type="button"
                  :disabled="lifecyclePending"
                  class="rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  @click="handleArchive"
                >
                  {{ lifecyclePending ? 'Archiving…' : 'Archive' }}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  </div>
</template>
