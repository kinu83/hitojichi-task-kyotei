<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import type { Comment } from '@hitojichi/shared'

const MAX_BUBBLES = 3

// Figmaのコメントのように、書いた人の頭文字入りの吹き出しを並べ、合わせると全文を出す
const props = defineProps<{
  comments: (Comment & { id: string })[]
  memberName: (uid: string) => string
  currentUid: string | undefined
  isTaskOwner: boolean
  deletingId: string | null
}>()
defineEmits<{ delete: [commentId: string] }>()

// 新しいコメントほど右に出す。入りきらない分は「+N」にまとめる
const visibleComments = computed(() => props.comments.slice(-MAX_BUBBLES))
const hiddenCount = computed(() => props.comments.length - visibleComments.value.length)

// スマホはカーソルを合わせられないので、タップで開いたものを覚えておく（'all' は +N の一覧）
const openId = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}
function closeOnOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) openId.value = null
}
onMounted(() => document.addEventListener('pointerdown', closeOnOutside))
onUnmounted(() => document.removeEventListener('pointerdown', closeOnOutside))

function canDelete(comment: Comment) {
  return comment.authorId === props.currentUid || props.isTaskOwner
}

function formatDate(date: Comment['createdAt'] | { toDate(): Date } | null) {
  if (!date) return ''
  return (date instanceof Date ? date : date.toDate()).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <ul ref="root" class="flex items-center" aria-label="コメント">
    <li v-if="hiddenCount" class="bubble-item">
      <button
        type="button"
        class="bubble more"
        :aria-expanded="openId === 'all'"
        :aria-label="`コメントをすべて表示（全${comments.length}件）`"
        @click="toggle('all')"
      >
        +{{ hiddenCount }}
      </button>
      <div class="bubble-popover max-h-72 overflow-y-auto" :class="{ 'is-open': openId === 'all' }">
        <ol class="grid gap-3">
          <li v-for="comment in comments" :key="comment.id">
            <p class="flex items-center justify-between gap-2 text-xs">
              <span class="font-bold">{{ memberName(comment.authorId) }}</span>
              <span class="text-ink/60">{{ formatDate(comment.createdAt) }}</span>
            </p>
            <p class="mt-1 text-sm break-words whitespace-pre-wrap">{{ comment.text }}</p>
          </li>
        </ol>
      </div>
    </li>
    <li v-for="comment in visibleComments" :key="comment.id" class="bubble-item">
      <button
        type="button"
        class="bubble"
        :class="{ 'is-mine': comment.authorId === currentUid }"
        :aria-expanded="openId === comment.id"
        :aria-label="`${memberName(comment.authorId)}のコメントを表示`"
        @click="toggle(comment.id)"
      >
        {{ memberName(comment.authorId).slice(0, 1) }}
      </button>
      <div class="bubble-popover" :class="{ 'is-open': openId === comment.id }">
        <p class="flex items-center justify-between gap-2 text-xs">
          <span class="font-bold">{{ memberName(comment.authorId) }}</span>
          <span class="text-ink/60">{{ formatDate(comment.createdAt) }}</span>
        </p>
        <p class="mt-1 text-sm break-words whitespace-pre-wrap">{{ comment.text }}</p>
        <button
          v-if="canDelete(comment)"
          type="button"
          class="mt-2 ml-auto flex w-fit cursor-pointer items-center gap-1 rounded-lg border-2 border-ink bg-white px-2 py-1 text-xs font-bold hover:bg-muted/40 disabled:opacity-50"
          :disabled="deletingId !== null"
          @click="$emit('delete', comment.id)"
        >
          <Trash2 :size="14" aria-hidden="true" />削除
        </button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
@reference '../assets/main.css';
.bubble-item {
  @apply relative -ml-1.5 first:ml-0;
}
/* 右下だけ角を残して吹き出しの形にする */
.bubble {
  @apply grid size-8 cursor-pointer place-items-center rounded-full rounded-br-none border-2 border-ink bg-white font-display text-xs text-ink shadow-sm transition hover:-translate-y-0.5;
}
.bubble.is-mine {
  @apply bg-accent;
}
.bubble.more {
  @apply bg-ink font-dot text-accent;
}
/* カーソルを合わせたとき（PC）か、タップで開いたとき（スマホ）に全文を出す。
   ボタンとの間に隙間を作らないよう、paddingで離してカーソルの移動中に消えないようにする */
.bubble-popover {
  @apply invisible absolute top-full right-0 z-30 w-64 max-w-[80vw] rounded-2xl border-2 border-ink bg-white p-3 text-left text-ink opacity-0 shadow-sm transition;
  margin-top: 0.375rem;
}
.bubble-popover::before {
  content: '';
  @apply absolute -top-2 right-0 left-0 h-2;
}
.bubble-item:hover > .bubble-popover,
.bubble-popover.is-open {
  @apply visible opacity-100;
}
</style>
