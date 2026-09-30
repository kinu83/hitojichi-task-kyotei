<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus, Users } from 'lucide-vue-next'
import { useTeams } from '@/composables/useTeams'

const { teams } = useTeams()
const isPending = computed(() => teams.pending.value)
const loadError = computed(() => teams.error.value)
</script>

<template>
  <!-- TODO(saya): 招待コードで参加する入力欄を追加（useCallables の joinTeam を呼び、teamName を表示してから移動） -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold">チーム一覧</h1>
    <RouterLink
      to="/teams/new"
      class="flex items-center gap-1 rounded border px-3 py-1.5 text-sm font-bold"
    >
      <Plus :size="16" />
      新規チーム作成
    </RouterLink>
  </div>

  <p v-if="isPending" class="mt-4 text-sm text-gray-500">読み込み中…</p>
  <p v-else-if="loadError" class="mt-4 text-sm text-red-600">チーム一覧の取得に失敗しました。</p>
  <p v-else-if="teams.length === 0" class="mt-4 text-sm text-gray-500">
    まだ所属チームがありません。「新規チーム作成」から始めましょう。
  </p>

  <ul v-else class="mt-4 flex flex-col gap-2">
    <li v-for="team in teams" :key="team.id">
      <RouterLink
        :to="`/teams/${team.id}`"
        class="flex items-center gap-2 rounded border px-4 py-3 hover:bg-gray-50"
      >
        <Users :size="18" />
        <span class="font-bold">{{ team.name }}</span>
        <span class="ml-auto text-xs text-gray-500">招待コード: {{ team.inviteCode }}</span>
      </RouterLink>
    </li>
  </ul>
</template>
