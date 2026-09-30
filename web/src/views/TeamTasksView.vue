<script setup lang="ts">
import { computed, ref } from 'vue'
import { Timestamp } from 'firebase/firestore'
import { useCurrentUser } from 'vuefire'
import { Check, Pencil, Plus } from 'lucide-vue-next'
import {
  createTaskInput,
  taskStatusSchema,
  updateTeamHostageInput,
  type Task,
} from '@hitojichi/shared'
import { useTeamTasks } from '@/composables/useTeamTasks'
import { useTeamMembers } from '@/composables/useTeamMembers'
import { useTitles } from '@/composables/useTitles'
import HostageTitleFields from '@/components/HostageTitleFields.vue'

const props = defineProps<{ teamId: string }>()

const currentUser = useCurrentUser()
const { team, tasks, teamProgress, isCreator, createTask, completeTask, updateHostage } =
  useTeamTasks(() => props.teamId)
const memberIds = computed(() => team.value?.memberIds)
const members = useTeamMembers(memberIds)
const { titles } = useTitles()
const isTasksPending = computed(() => tasks.pending.value)

function memberName(uid: string) {
  return members.value.find((member) => member.id === uid)?.displayName ?? '(不明なメンバー)'
}

function titleName(titleId: string | undefined) {
  return titles.value.find((title) => title.id === titleId)?.name ?? '(未設定)'
}

// FirestoreのTimestampがそのまま返ってくる場合があるため、表示前にDateへ揃える
function formatDueAt(dueAt: Task['dueAt']) {
  const date = dueAt instanceof Timestamp ? dueAt.toDate() : dueAt
  return date.toLocaleString('ja-JP')
}

const statusLabel: Record<(typeof taskStatusSchema)['options'][number], string> = {
  todo: '未着手',
  done: '完了',
  overdue: '期限切れ',
}

// --- 人質（称号の組）の変更：作成者のみ ---
const isEditingHostage = ref(false)
const editSelfDisTitleId = ref('')
const editTeamDisTitleId = ref('')
const hostageErrorMessage = ref('')

function startEditHostage() {
  editSelfDisTitleId.value = team.value?.selfDisTitleId ?? ''
  editTeamDisTitleId.value = team.value?.teamDisTitleId ?? ''
  hostageErrorMessage.value = ''
  isEditingHostage.value = true
}

async function saveHostage() {
  hostageErrorMessage.value = ''
  const parsed = updateTeamHostageInput.safeParse({
    selfDisTitleId: editSelfDisTitleId.value,
    teamDisTitleId: editTeamDisTitleId.value,
  })
  if (!parsed.success) {
    hostageErrorMessage.value = '称号を2つとも選択してください。'
    return
  }
  try {
    await updateHostage(parsed.data)
    isEditingHostage.value = false
  } catch (error) {
    console.error(error)
    hostageErrorMessage.value = '人質の変更に失敗しました。もう一度お試しください。'
  }
}

// --- 自分のタスクの追加 ---
const title = ref('')
const dueAt = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  errorMessage.value = ''
  const parsed = createTaskInput.safeParse({
    title: title.value,
    dueAt: dueAt.value ? new Date(dueAt.value) : undefined,
  })
  if (!parsed.success) {
    errorMessage.value = 'タスク名と期限を入力してください。'
    return
  }

  isSubmitting.value = true
  try {
    await createTask(parsed.data)
    title.value = ''
    dueAt.value = ''
  } catch (error) {
    console.error(error)
    errorMessage.value = 'タスクの作成に失敗しました。もう一度お試しください。'
  } finally {
    isSubmitting.value = false
  }
}

async function onComplete(task: Task & { id: string }) {
  try {
    await completeTask(task.id)
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <!-- TODO(saya): デモ用の「今すぐ判定」ボタン（useCallables の judgeOverdueTasks）と、称号付与・格上げ（previousTitleId）の演出 -->
  <h1 class="text-xl font-bold">タスク管理（{{ team?.name ?? '読み込み中…' }}）</h1>

  <section class="mt-4 max-w-md rounded border p-4">
    <p class="text-sm font-bold">チーム進捗度：{{ teamProgress }}%</p>
    <div class="mt-2 h-3 overflow-hidden rounded bg-gray-200">
      <div class="h-full bg-gray-700" :style="{ width: `${teamProgress}%` }" />
    </div>
  </section>

  <section class="mt-4 flex max-w-md flex-col gap-3 rounded border p-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-bold">人質</p>
      <button
        v-if="isCreator && !isEditingHostage"
        class="flex items-center gap-1 rounded border px-3 py-1 text-sm"
        @click="startEditHostage"
      >
        <Pencil :size="14" />
        変更
      </button>
    </div>

    <template v-if="isEditingHostage">
      <HostageTitleFields
        v-model:self-dis-title-id="editSelfDisTitleId"
        v-model:team-dis-title-id="editTeamDisTitleId"
      />
      <p v-if="hostageErrorMessage" class="text-sm text-red-600">{{ hostageErrorMessage }}</p>
      <div class="flex gap-2">
        <button class="rounded border px-3 py-1.5 text-sm font-bold" @click="saveHostage">
          保存
        </button>
        <button class="rounded border px-3 py-1.5 text-sm" @click="isEditingHostage = false">
          キャンセル
        </button>
      </div>
    </template>
    <template v-else>
      <p class="text-sm">dis称号（サボった本人）：{{ titleName(team?.selfDisTitleId) }}</p>
      <p class="text-sm">team dis称号（仲間）：{{ titleName(team?.teamDisTitleId) }}</p>
    </template>
  </section>

  <form class="mt-4 flex max-w-md flex-col gap-3 rounded border p-4" @submit.prevent="submit">
    <p class="text-sm font-bold">自分のタスクを追加</p>
    <label class="flex flex-col gap-1 text-sm">
      タスク名
      <input
        v-model="title"
        type="text"
        maxlength="100"
        placeholder="例：企画書を書く"
        class="rounded border px-3 py-2"
      />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      期限
      <input v-model="dueAt" type="datetime-local" class="rounded border px-3 py-2" />
    </label>

    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

    <button
      type="submit"
      class="flex items-center justify-center gap-1 rounded border px-4 py-2 font-bold disabled:opacity-50"
      :disabled="isSubmitting"
    >
      <Plus :size="16" />
      {{ isSubmitting ? '作成中…' : 'タスクを追加' }}
    </button>
  </form>

  <p v-if="isTasksPending" class="mt-6 text-sm text-gray-500">読み込み中…</p>
  <p v-else-if="tasks.length === 0" class="mt-6 text-sm text-gray-500">タスクはまだありません。</p>

  <ul v-else class="mt-6 flex flex-col gap-2">
    <li
      v-for="task in tasks"
      :key="task.id"
      class="flex items-center gap-3 rounded border px-4 py-3"
    >
      <div class="flex-1">
        <p class="font-bold">{{ task.title }}</p>
        <p class="text-xs text-gray-500">{{ memberName(task.ownerId) }} のタスク</p>
        <p class="text-xs text-gray-500">期限: {{ formatDueAt(task.dueAt) }}</p>
      </div>
      <span class="text-xs font-bold">{{ statusLabel[task.status] }}</span>
      <!-- 完了にできるのは本人のタスクだけ（Firestoreルールでも制限） -->
      <button
        v-if="task.status === 'todo' && task.ownerId === currentUser?.uid"
        class="flex items-center gap-1 rounded border px-3 py-1.5 text-sm"
        @click="onComplete(task)"
      >
        <Check :size="16" />
        完了
      </button>
    </li>
  </ul>
</template>
