<script setup lang="ts">
const config = useRuntimeConfig()

const statusItems = [
  { label: 'Phase', value: 'Foundation' },
  { label: 'Sprint', value: 'Sprint 0' },
  { label: 'Status', value: 'READY' },
] as const
</script>

<template>
  <div class="mx-auto max-w-screen-xl px-6 py-24 flex flex-col items-center justify-center gap-8 text-center">
    <div class="flex flex-col items-center gap-4">
      <div class="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1">
        <span class="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
        <span class="font-mono text-xs text-muted-foreground">
          v{{ config.public.appVersion }} &middot; Sprint 0 &middot; Foundation
        </span>
      </div>

      <h1 class="font-sans text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {{ config.public.appName }}
      </h1>

      <p class="max-w-xl text-base text-muted-foreground leading-relaxed">
        AI-assisted software execution platform with deterministic contracts,
        audit-safe evidence, and controlled autonomy.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 w-full max-w-2xl">
      <div
        v-for="item in statusItems"
        :key="item.label"
        class="rounded-lg border border-border bg-muted p-4 text-left"
      >
        <p class="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">
          {{ item.label }}
        </p>
        <p class="font-mono text-sm font-medium text-foreground">
          {{ item.value }}
        </p>
      </div>
    </div>
  </div>
</template>
