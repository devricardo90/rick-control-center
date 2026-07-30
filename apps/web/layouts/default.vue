<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-border bg-background">
      <div class="mx-auto max-w-screen-xl px-6 h-14 flex items-center gap-3">
        <span class="font-mono text-xs font-semibold tracking-widest text-muted-foreground uppercase select-none">
          RICK
        </span>
        <span class="text-border">/</span>
        <span class="font-sans text-sm font-medium text-foreground">
          Control Center
        </span>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
