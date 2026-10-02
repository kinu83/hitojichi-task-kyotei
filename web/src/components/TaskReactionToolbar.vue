<script setup lang="ts">
import { ref, useId } from 'vue'
import { MessageCircle, Send, X } from 'lucide-vue-next'
import { MAX_COMMENT_LENGTH, type ReactionType } from '@hitojichi/shared'
import { REACTIONS } from '@/lib/reactionTypes'

// タスクにカーソルを合わせる（スマホはタップ）と、カード右上に重なって出る吹き出し
const props = defineProps<{
  open: boolean // タップで開いているとき（カーソルを合わせたときはCSSで表示）
  myReactionTypes: ReactionType[]
  busyType: ReactionType | null
  sendComment: (text: string) => Promise<void> // 失敗したら例外を投げる
}>()
defineEmits<{ react: [type: ReactionType] }>()

const draft = ref('')
const isWriting = ref(false)
const isSending = ref(false)
const inputId = useId()

async function send() {
  const text = draft.value.trim()
  if (!text || isSending.value) return
  isSending.value = true
  try {
    await props.sendComment(text)
    draft.value = ''
    isWriting.value = false
  } catch {
    // エラー表示は親が行う。入力は消さずに残して再送できるようにする
  } finally {
    isSending.value = false
  }
}

function cancel() {
  draft.value = ''
  isWriting.value = false
}
</script>

<template>
  <!-- 高さの1/4だけカードに重ねる（3/4はカードの上にはみ出す）。入力中はカーソルが外れても閉じない -->
  <div
    class="reaction-toolbar"
    :class="{ 'is-open': open || isWriting }"
    role="toolbar"
    aria-label="リアクションとコメント"
  >
    <!-- スマホ幅に収めるため、コメント入力中は絵文字を隠して入力欄を広く使う -->
    <template v-if="!isWriting">
      <button
        v-for="reaction in REACTIONS"
        :key="reaction.type"
        type="button"
        class="reaction-option"
        :class="{ 'is-mine': myReactionTypes.includes(reaction.type) }"
        :aria-pressed="myReactionTypes.includes(reaction.type)"
        :aria-label="reaction.label"
        :title="reaction.label"
        :disabled="busyType !== null"
        @click="$emit('react', reaction.type)"
      >
        <span aria-hidden="true">{{ reaction.emoji }}</span>
      </button>
      <span class="mx-1 h-6 w-px shrink-0 bg-muted" aria-hidden="true" />
    </template>
    <form v-if="isWriting" class="flex min-w-0 items-center gap-1" @submit.prevent="send">
      <label :for="inputId" class="sr-only">コメント</label>
      <input
        :id="inputId"
        v-model="draft"
        type="text"
        :maxlength="MAX_COMMENT_LENGTH"
        placeholder="コメントを書く…"
        class="comment-input"
        :disabled="isSending"
        autofocus
        @keydown.esc="cancel"
      />
      <button
        type="submit"
        class="reaction-option"
        aria-label="コメントを送信"
        :disabled="isSending || !draft.trim()"
      >
        <Send :size="16" aria-hidden="true" />
      </button>
      <button type="button" class="reaction-option" aria-label="入力をやめる" @click="cancel">
        <X :size="16" aria-hidden="true" />
      </button>
    </form>
    <button v-else type="button" class="comment-trigger" @click="isWriting = true">
      <MessageCircle :size="16" aria-hidden="true" />コメントを書く…
    </button>
  </div>
</template>

<style scoped>
@reference '../assets/main.css';
.reaction-toolbar {
  @apply invisible absolute top-0 right-3 z-20 flex max-w-[calc(100%-1.5rem)] -translate-y-3/4 items-center gap-0.5 rounded-full border-2 border-ink bg-white px-2 py-1 text-ink opacity-0 shadow-sm transition;
}
/* PCでカーソルを合わせたとき・フォーカスしたときの表示は、TeamTasksView.vue の .task-item 側で指定する */
.reaction-toolbar.is-open {
  @apply visible opacity-100;
}
.reaction-option {
  @apply grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-lg transition hover:scale-110 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50;
}
.reaction-option.is-mine {
  @apply bg-accent;
}
.comment-trigger {
  @apply flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs whitespace-nowrap text-ink/70 hover:bg-muted/40;
}
.comment-input {
  @apply w-44 min-w-0 rounded-full border-2 border-muted bg-canvas px-3 py-1 text-xs text-ink outline-none focus:border-primary sm:w-52;
}
</style>
