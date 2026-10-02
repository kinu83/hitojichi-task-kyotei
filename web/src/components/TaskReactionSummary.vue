<script setup lang="ts">
import type { ReactionType } from '@hitojichi/shared'
import type { ReactionSummary } from '@/composables/useTaskReactions'
import { reactionOf } from '@/lib/reactionTypes'

// 付いているリアクションだけをアイコンで並べる。2件以上なら件数も添える
defineProps<{
  summaries: ReactionSummary[]
  busyType: ReactionType | null
  memberName: (uid: string) => string
}>()
defineEmits<{ toggle: [type: ReactionType] }>()
</script>

<template>
  <ul class="flex flex-wrap items-center gap-1.5" aria-label="リアクション">
    <li v-for="summary in summaries" :key="summary.type">
      <!-- 押すと自分のリアクションを付ける・取り消す。カーソルを合わせると誰が付けたか分かる -->
      <button
        type="button"
        class="reaction-chip"
        :class="{ 'is-mine': summary.isMine }"
        :aria-pressed="summary.isMine"
        :aria-label="`${reactionOf(summary.type).label} ${summary.userIds.length}件`"
        :title="`${reactionOf(summary.type).label}：${summary.userIds.map(memberName).join('、')}`"
        :disabled="busyType !== null"
        @click="$emit('toggle', summary.type)"
      >
        <span aria-hidden="true">{{ reactionOf(summary.type).emoji }}</span>
        <span v-if="summary.userIds.length >= 2" class="font-dot">{{
          summary.userIds.length
        }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
@reference '../assets/main.css';
.reaction-chip {
  @apply flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-full border-2 border-ink bg-white px-2 text-sm font-bold text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50;
}
.reaction-chip.is-mine {
  @apply bg-accent;
}
</style>
