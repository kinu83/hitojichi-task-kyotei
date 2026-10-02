<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCurrentUser } from 'vuefire'
import type { ReactionType } from '@hitojichi/shared'
import { useTaskReactions } from '@/composables/useTaskReactions'
import { useTaskComments } from '@/composables/useTaskComments'
import TaskReactionToolbar from '@/components/TaskReactionToolbar.vue'
import TaskReactionSummary from '@/components/TaskReactionSummary.vue'
import TaskCommentBubbles from '@/components/TaskCommentBubbles.vue'

// タスクへのリアクション・コメント。データの購読はここで1回だけ行い、表示は子の部品に任せる
// .task-item（position: relative）の中に置く。ツールバーはカード右上、まとめ表示はカード下部に出る
const props = defineProps<{
  teamId: string
  taskId: string
  isTaskOwner: boolean
  toolbarOpen: boolean // スマホでタスクをタップして開いているとき
  memberName: (uid: string) => string
}>()

const currentUser = useCurrentUser()
const { summaries, busyType, toggleReaction } = useTaskReactions(
  () => props.teamId,
  () => props.taskId,
)
const { comments, addComment, deleteComment } = useTaskComments(
  () => props.teamId,
  () => props.taskId,
)
const myReactionTypes = computed(() =>
  summaries.value.filter((summary) => summary.isMine).map((summary) => summary.type),
)
const errorMessage = ref('')
const deletingId = ref<string | null>(null)

async function react(type: ReactionType) {
  errorMessage.value = ''
  try {
    await toggleReaction(type)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'リアクションできませんでした。もう一度お試しください。'
  }
}

async function sendComment(text: string) {
  errorMessage.value = ''
  try {
    await addComment({ text })
  } catch (error) {
    console.error(error)
    errorMessage.value = 'コメントを送れませんでした。もう一度お試しください。'
    throw error // 入力欄の文字を残すため、ツールバーにも失敗を伝える
  }
}

async function removeComment(commentId: string) {
  if (deletingId.value || !window.confirm('このコメントを削除しますか？')) return
  errorMessage.value = ''
  deletingId.value = commentId
  try {
    await deleteComment(commentId)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'コメントを削除できませんでした。もう一度お試しください。'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <!-- display: contents で、子をタスクカード（flex）の直接の要素として並べる -->
  <div class="contents">
    <TaskReactionToolbar
      :open="toolbarOpen"
      :my-reaction-types="myReactionTypes"
      :busy-type="busyType"
      :send-comment="sendComment"
      @react="react"
    />
    <div
      v-if="summaries.length || comments.length"
      class="flex basis-full flex-wrap items-center justify-between gap-2"
    >
      <TaskReactionSummary
        :summaries="summaries"
        :busy-type="busyType"
        :member-name="memberName"
        @toggle="react"
      />
      <TaskCommentBubbles
        v-if="comments.length"
        class="ml-auto"
        :comments="comments"
        :member-name="memberName"
        :current-uid="currentUser?.uid"
        :is-task-owner="isTaskOwner"
        :deleting-id="deletingId"
        @delete="removeComment"
      />
    </div>
    <p v-if="errorMessage" role="alert" class="basis-full text-xs font-bold text-red-600">
      {{ errorMessage }}
    </p>
  </div>
</template>
