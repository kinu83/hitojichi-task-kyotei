<script setup lang="ts">
import { computed } from 'vue'
import { Lock, Skull } from 'lucide-vue-next'
import { useTitles } from '@/composables/useTitles'
import { useCurrentUserProfile } from '@/composables/useCurrentUserProfile'

const { titles } = useTitles()
const { profile } = useCurrentUserProfile()

const isPending = computed(() => titles.pending.value)
const loadError = computed(() => titles.error.value)

const ownedTitleIds = computed(() => new Set(profile.value?.titleIds ?? []))
function isOwned(titleId: string) {
  return ownedTitleIds.value.has(titleId)
}

// TODO(saya): shameLevel は key が使うか決めるまで仮。これに頼った見た目は作り込まない
const sortedTitles = computed(() => [...titles.value].sort((a, b) => b.shameLevel - a.shameLevel))
</script>

<template>
  <h1 class="text-xl font-bold">称号一覧</h1>

  <p v-if="isPending" class="mt-4 text-sm text-gray-500">読み込み中…</p>
  <p v-else-if="loadError" class="mt-4 text-sm text-red-600">称号一覧の取得に失敗しました。</p>
  <p v-else-if="sortedTitles.length === 0" class="mt-4 text-sm text-gray-500">
    まだ称号が登録されていません。
  </p>

  <ul v-else class="mt-4 flex flex-col gap-2">
    <li
      v-for="title in sortedTitles"
      :key="title.id"
      class="flex items-center gap-3 rounded border px-4 py-3"
      :class="isOwned(title.id) ? '' : 'opacity-50'"
    >
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-bold">{{ title.name }}</span>
          <span v-if="isOwned(title.id)" class="rounded border px-1.5 py-0.5 text-xs font-bold">
            獲得済み
          </span>
          <Lock v-else :size="14" class="text-gray-400" />
        </div>
        <p class="text-xs text-gray-500">{{ title.description }}</p>
      </div>
      <div class="flex items-center gap-0.5" :title="`不名誉度 ${title.shameLevel}`">
        <Skull v-for="i in title.shameLevel" :key="i" :size="14" class="text-gray-500" />
      </div>
    </li>
  </ul>
</template>
