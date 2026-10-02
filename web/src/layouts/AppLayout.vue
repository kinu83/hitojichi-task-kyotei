<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { signOut } from 'firebase/auth'
import { LogOut, Trophy, UserRound, Users } from 'lucide-vue-next'
import { auth } from '@/lib/firebase'
import { useTeams } from '@/composables/useTeams'
import { useCurrentUserProfile } from '@/composables/useCurrentUserProfile'
import { useCompletedTaskCount } from '@/composables/useCompletedTaskCount'

const route = useRoute()
const router = useRouter()
const showNav = computed(() => route.name !== 'login')

const navItems = [
  { to: '/', label: 'チーム', icon: Users },
  { to: '/titles', label: '称号', icon: Trophy },
  { to: '/profile', label: 'プロフィール', icon: UserRound },
]

// 右上のユーザーバッジ：表示名と、これまでに達成したタスク数（CLEAR）
const { profile } = useCurrentUserProfile()
const { teams } = useTeams()
const { count: clearCount } = useCompletedTaskCount(() => teams.value.map((team) => team.id))
const displayName = computed(() => profile.value?.displayName ?? '')
const initial = computed(() => displayName.value.charAt(0) || '?')

async function logout() {
  await signOut(auth)
  await router.push('/login')
}
</script>

<template>
  <div class="min-h-dvh">
    <header v-if="showNav" class="border-b-4 border-accent bg-ink">
      <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <RouterLink
          to="/"
          class="flex shrink-0 items-center gap-3"
          aria-label="人質タスク協定 ホーム"
        >
          <img src="/images/icon.png" alt="" class="size-12" />
          <img src="/images/logo.png" alt="人質タスク協定" class="hidden h-9 sm:block" />
          <span class="hidden text-sm font-bold text-white lg:block"
            >仲間を人質に、サボりを封じろ</span
          >
        </RouterLink>

        <div class="flex items-center gap-4">
          <nav class="flex items-center gap-1" aria-label="メインメニュー">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              :aria-label="item.label"
              class="flex items-center gap-1.5 rounded-xl border-2 border-transparent px-3 py-2 font-bold text-white/70 transition hover:text-white"
              exact-active-class="border-accent! bg-primary text-white!"
            >
              <component :is="item.icon" :size="20" aria-hidden="true" />
              <span class="hidden md:inline">{{ item.label }}</span>
            </RouterLink>
            <button
              type="button"
              aria-label="ログアウト"
              class="flex items-center gap-1.5 rounded-xl border-2 border-transparent px-3 py-2 font-bold text-white/70 transition hover:text-white"
              @click="logout"
            >
              <LogOut :size="20" aria-hidden="true" />
              <span class="hidden md:inline">ログアウト</span>
            </button>
          </nav>

          <div
            class="hidden shrink-0 items-center gap-3 rounded-full border-2 border-white/60 py-1.5 pr-5 pl-1.5 sm:flex"
          >
            <span
              class="grid size-10 place-items-center rounded-full border-2 border-ink bg-accent font-display text-ink"
              aria-hidden="true"
            >
              {{ initial }}
            </span>
            <div class="leading-tight">
              <p class="max-w-28 truncate font-bold text-white">{{ displayName }}</p>
              <p class="font-dot text-xs text-accent">★ {{ clearCount }} CLEAR</p>
            </div>
          </div>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>
