<script setup lang="ts">
/**
 * Minimal functional login page — sufficient to exercise authentication.
 * Full interface design is out of scope for NDERCC-6.
 */
const username = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  isSubmitting.value = true

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    await navigateTo('/')
  }
  catch {
    errorMessage.value = 'Invalid username or password.'
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
    <h1 class="font-sans text-2xl font-semibold text-foreground">
      Sign in
    </h1>

    <form
      class="flex flex-col gap-4"
      @submit.prevent="handleSubmit"
    >
      <div class="flex flex-col gap-1">
        <label
          for="username"
          class="text-sm text-muted-foreground"
        >Username</label>
        <input
          id="username"
          v-model="username"
          type="text"
          autocomplete="username"
          required
          class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label
          for="password"
          class="text-sm text-muted-foreground"
        >Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <p
        v-if="errorMessage"
        class="text-sm text-red-500"
      >
        {{ errorMessage }}
      </p>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Sign in
      </button>
    </form>
  </div>
</template>
