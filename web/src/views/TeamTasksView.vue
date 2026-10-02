<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Timestamp } from 'firebase/firestore'
import { useCurrentUser } from 'vuefire'
import {
  Check,
  Clock,
  Copy,
  Flame,
  Info,
  Pencil,
  Plus,
  Skull,
  Swords,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-vue-next'
import {
  createTaskInput,
  updateTaskInput,
  taskStatusSchema,
  updateTeamHostageInput,
  MAX_TEAM_MEMBERS,
  type Task,
} from '@hitojichi/shared'
import { useTeamTasks } from '@/composables/useTeamTasks'
import { useTeamMembers } from '@/composables/useTeamMembers'
import { useTitles } from '@/composables/useTitles'
import { useOverdueCheck } from '@/composables/useOverdueCheck'
import HostageTitleFields from '@/components/HostageTitleFields.vue'
import TaskProofs from '@/components/TaskProofs.vue'
import TaskFeedback from '@/components/TaskFeedback.vue'

const props = defineProps<{ teamId: string }>()

const currentUser = useCurrentUser()
const {
  team,
  tasks,
  teamProgress,
  isCreator,
  createTask,
  setTaskStatus,
  updateTask,
  deleteTask,
  updateHostage,
} = useTeamTasks(() => props.teamId)
const memberIds = computed(() => team.value?.memberIds)
const members = useTeamMembers(memberIds)
const { titles } = useTitles()
// エミュレータでは期限切れ判定が自動で動かないので、手動で実行するボタンを出す
const {
  isAvailable: canRunOverdueCheck,
  isRunning: isRunningOverdueCheck,
  error: overdueCheckError,
  runOverdueCheck,
} = useOverdueCheck()
const isTasksPending = computed(() => tasks.pending.value)
const isTeamPending = computed(() => team.pending.value)
const loadError = computed(() => team.error.value || tasks.error.value)
// 募集表示は最新のチーム情報を使い、満員になったら招待コードも隠す。
const canInvite = computed(
  () =>
    !isTeamPending.value &&
    !team.error.value &&
    !!team.value?.inviteCode &&
    team.value.memberIds.length < MAX_TEAM_MEMBERS,
)
// コピーできたら少しの間アイコンをチェックに変える。失敗時だけ文章で案内する
const isCopied = ref(false)
const copyError = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyInviteCode() {
  const code = team.value?.inviteCode
  if (!canInvite.value || !code) return
  const teamId = props.teamId
  copyError.value = ''
  try {
    // 標準のClipboard APIを使い、失敗時は手動コピーできる案内を表示する。
    await navigator.clipboard.writeText(code)
    if (props.teamId !== teamId) return
    isCopied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (isCopied.value = false), 2000)
  } catch (error) {
    console.error(error)
    if (props.teamId === teamId)
      copyError.value = 'コピーできませんでした。招待コードを選択してコピーしてください。'
  }
}
onUnmounted(() => clearTimeout(copiedTimer))

const activeFilter = ref<'all' | 'unfinished' | 'done'>('all')
const filters = [
  { value: 'all', label: 'すべて' },
  { value: 'unfinished', label: '未達成' },
  { value: 'done', label: '達成' },
] as const
const isCreatingTask = ref(false)
const now = ref(Date.now())
const completedCount = computed(() => tasks.value.filter((task) => task.status === 'done').length)
const overdueCount = computed(() => tasks.value.filter(isDisplayOverdue).length)
// 人質の称号の発動中表示は、見ている人の立場で分ける（useActiveDisTitlesと同じ考え方）
// 自分のタスクが期限切れ → 自分に付く「本人」の称号が発動中
const isSelfDisTitleActive = computed(() =>
  tasks.value.some((task) => task.ownerId === currentUser.value?.uid && isDisplayOverdue(task)),
)
// 仲間のタスクが期限切れ → 人質の自分に付く「仲間」の称号が発動中
const isTeamDisTitleActive = computed(() =>
  tasks.value.some((task) => task.ownerId !== currentUser.value?.uid && isDisplayOverdue(task)),
)
// 所属情報にない所有者のタスクも落とさず表示する。
const memberCards = computed(() => {
  const ids = [
    ...new Set([...(team.value?.memberIds ?? []), ...tasks.value.map((task) => task.ownerId)]),
  ]
  // 表示用の配列だけ並べ替え、自分以外のメンバーの順序は維持する。
  const selfIndex = ids.indexOf(currentUser.value?.uid ?? '')
  if (selfIndex > 0) {
    ids.unshift(...ids.splice(selfIndex, 1))
  }
  return ids.map((uid) => {
    const memberTasks = tasks.value.filter((task) => task.ownerId === uid)
    const equippedTitleId = members.value.find((member) => member.id === uid)?.equippedTitleId
    return {
      uid,
      tasks: memberTasks.filter(
        (task) =>
          task.id === editingTaskId.value ||
          activeFilter.value === 'all' ||
          (activeFilter.value === 'done' ? task.status === 'done' : task.status !== 'done'),
      ),
      total: memberTasks.length,
      done: memberTasks.filter((task) => task.status === 'done').length,
      equippedTitle: titles.value.find((title) => title.id === equippedTitleId),
    }
  })
})

function memberName(uid: string) {
  return members.value.find((member) => member.id === uid)?.displayName ?? '(不明なメンバー)'
}

function titleName(titleId: string | undefined) {
  return titles.value.find((title) => title.id === titleId)?.name ?? '(未設定)'
}

function titleDescription(titleId: string | undefined) {
  return titles.value.find((title) => title.id === titleId)?.description
}

// FirestoreのTimestampがそのまま返ってくる場合があるため、表示前にDateへ揃える
function formatDueAt(dueAt: Task['dueAt']) {
  const date = dueAt instanceof Timestamp ? dueAt.toDate() : dueAt
  return date.toLocaleString('ja-JP')
}

function isCompletedLate(task: Task) {
  return task.status === 'done' && (task.completedLate ?? task.completedAfterOverdue ?? false)
}

// Schedulerを待つ間も表示だけ補完する。正式な状態・称号はバックエンドが確定する。
function isDisplayOverdue(task: Task) {
  const dueAt = task.dueAt instanceof Timestamp ? task.dueAt.toDate() : task.dueAt
  return task.status === 'overdue' || (task.status === 'todo' && dueAt.getTime() <= now.value)
}

const statusLabel: Record<(typeof taskStatusSchema)['options'][number], string> = {
  todo: '未着手',
  done: '完了',
  overdue: '期限切れ',
}

// --- 人質の説明（ⓘ）：PCはカーソルを合わせると出る。スマホはタップで開閉し、外側をタップで閉じる ---
const isHostageInfoOpen = ref(false)
const hostageInfo = ref<HTMLElement | null>(null)
function closeHostageInfoOnOutside(event: PointerEvent) {
  if (!hostageInfo.value?.contains(event.target as Node)) isHostageInfoOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', closeHostageInfoOnOutside))
onUnmounted(() => document.removeEventListener('pointerdown', closeHostageInfoOnOutside))

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
// 分単位の入力なので、選択できる最初の未来の分へ切り上げる。
const minDueAt = ref('')
function refreshMinDueAt() {
  now.value = Date.now()
  const date = new Date(Math.ceil((now.value + 1) / 60000) * 60000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  minDueAt.value = local.toISOString().slice(0, 16)
}
let minDueAtTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshMinDueAt()
  minDueAtTimer = setInterval(refreshMinDueAt, 1000)
})
onUnmounted(() => clearInterval(minDueAtTimer))

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

  if (parsed.data.dueAt.getTime() <= Date.now()) {
    errorMessage.value = '期限は現在より未来にしてください。'
    refreshMinDueAt()
    return
  }

  isSubmitting.value = true
  try {
    await createTask(parsed.data)
    title.value = ''
    dueAt.value = ''
    isCreatingTask.value = false
  } catch (error) {
    console.error(error)
    errorMessage.value = 'タスクの作成に失敗しました。もう一度お試しください。'
  } finally {
    isSubmitting.value = false
  }
}

const editingTaskId = ref<string | null>(null)
const editTitle = ref('')
const editDueAt = ref('')
// 編集開始時の期限。入力欄は分単位なので、期限に触れずに保存したときは秒以下も元のまま残す
let editOriginalDueAt: { text: string; date: Date } | null = null
const busyTaskId = ref<string | null>(null)
const taskErrorMessage = ref('')

watch(
  () => props.teamId,
  () => {
    isCopied.value = false
    copyError.value = ''
    editingTaskId.value = null
    taskErrorMessage.value = ''
    activeFilter.value = 'all'
    isCreatingTask.value = false
    isEditingHostage.value = false
    title.value = ''
    dueAt.value = ''
    errorMessage.value = ''
  },
)

function startEditTask(task: Task & { id: string }) {
  const date = task.dueAt instanceof Timestamp ? task.dueAt.toDate() : task.dueAt
  // datetime-localにはUTCではなくローカル時刻を渡す。分単位で選べるよう、秒以下は表示しない
  const pad = (value: number) => String(value).padStart(2, '0')
  editDueAt.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  editOriginalDueAt = { text: editDueAt.value, date }
  editTitle.value = task.title
  editingTaskId.value = task.id
  taskErrorMessage.value = ''
}

async function saveTask(taskId: string) {
  if (busyTaskId.value) return
  taskErrorMessage.value = ''
  const parsed = updateTaskInput.safeParse({
    title: editTitle.value,
    dueAt: !editDueAt.value
      ? undefined
      : editDueAt.value === editOriginalDueAt?.text
        ? editOriginalDueAt.date
        : new Date(editDueAt.value),
  })
  if (!parsed.success) {
    taskErrorMessage.value = 'タスク名（1〜100文字）と有効な期限を入力してください。'
    return
  }
  busyTaskId.value = taskId
  try {
    await updateTask(taskId, parsed.data)
    editingTaskId.value = null
  } catch (error) {
    console.error(error)
    taskErrorMessage.value = 'タスクの編集に失敗しました。もう一度お試しください。'
  } finally {
    busyTaskId.value = null
  }
}

async function onDelete(task: Task & { id: string }) {
  if (busyTaskId.value || !window.confirm(`「${task.title}」を削除しますか？`)) return
  taskErrorMessage.value = ''
  busyTaskId.value = task.id
  try {
    await deleteTask(task.id)
    if (editingTaskId.value === task.id) editingTaskId.value = null
  } catch (error) {
    console.error(error)
    taskErrorMessage.value = 'タスクの削除に失敗しました。もう一度お試しください。'
  } finally {
    busyTaskId.value = null
  }
}

// --- リアクション・コメントの吹き出し：PCはカーソルを合わせると出る。スマホはタスクをタップして開く ---
const toolbarTaskId = ref<string | null>(null)

function onTaskTap(event: PointerEvent, taskId: string) {
  if (event.pointerType !== 'touch') return
  // 完了・編集などのボタンを押したときは開かない
  if ((event.target as HTMLElement).closest('button, a, input, label, form, [role="toolbar"]'))
    return
  toolbarTaskId.value = toolbarTaskId.value === taskId ? null : taskId
}

// 開いているタスクの外側をタップしたら閉じる
function closeToolbarOnOutside(event: PointerEvent) {
  if (!toolbarTaskId.value) return
  const item = (event.target as HTMLElement).closest('.task-item')
  if (item?.getAttribute('data-task-id') !== toolbarTaskId.value) toolbarTaskId.value = null
}
onMounted(() => document.addEventListener('pointerdown', closeToolbarOnOutside))
onUnmounted(() => document.removeEventListener('pointerdown', closeToolbarOnOutside))

async function onComplete(task: Task & { id: string }) {
  if (busyTaskId.value) return
  taskErrorMessage.value = ''
  busyTaskId.value = task.id
  try {
    await setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done')
  } catch (error) {
    console.error(error)
    taskErrorMessage.value = '状態を変更できませんでした。タスクの状態を確認してください。'
  } finally {
    busyTaskId.value = null
  }
}
</script>

<template>
  <div class="task-page">
    <!-- TODO(saya): 称号が付いたとき・格上げされたときの演出 -->
    <header>
      <RouterLink to="/" class="mb-5 inline-flex text-sm font-bold hover:underline"
        >← チーム一覧</RouterLink
      >
      <div class="heading-row">
        <div class="min-w-0">
          <p class="mb-3 w-fit rounded bg-ink px-3 py-1 font-dot text-xs text-accent">
            TEAM QUEST / BATTLE
          </p>
          <!-- 招待コードは目立たせず、チーム名のおまけとして名前の右に置く（見出しには含めない） -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 class="flex min-w-0 items-center gap-3 font-display text-2xl sm:text-3xl">
              <span class="heading-icon"><Swords :size="26" /></span>
              <span class="min-w-0 break-words">{{ team?.name ?? '読み込み中…' }}</span>
            </h1>
            <p v-if="canInvite" class="invite-chip">
              <span class="sr-only">招待コード</span>
              <code class="font-dot tracking-widest break-all select-all">{{
                team?.inviteCode
              }}</code>
              <button
                type="button"
                class="invite-copy"
                :aria-label="isCopied ? 'コピーしました' : '招待コードをコピー'"
                :title="isCopied ? 'コピーしました' : '招待コードをコピー'"
                @click="copyInviteCode"
              >
                <Check v-if="isCopied" :size="14" :stroke-width="3" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
              </button>
            </p>
          </div>
          <p v-if="canInvite" class="sr-only" role="status">
            {{ isCopied ? 'コピーしました' : '' }}
          </p>
          <p v-if="copyError" role="alert" class="mt-2 text-xs text-red-600">
            {{ copyError }}
          </p>
          <p
            v-if="team?.description"
            class="mt-3 whitespace-pre-wrap break-words text-sm text-ink/70"
          >
            {{ team.description }}
          </p>
        </div>
        <!-- チーム作成時に決めた目標と期限。日付のみなのでDateに変換せず、チーム一覧と同じ表記にする -->
        <aside v-if="team?.goalDueDate" class="deadline-card" aria-label="目標の期限">
          <p class="text-xs text-white">目標の期限</p>
          <p class="mt-2 flex items-center justify-center gap-2 font-dot text-lg">
            <Clock :size="20" aria-hidden="true" />{{ team.goalDueDate.replaceAll('-', '/') }}
          </p>
          <p v-if="team.goal" class="mt-1 max-w-56 text-xs break-words text-white">
            {{ team.goal }}
          </p>
        </aside>
      </div>
    </header>
    <p v-if="loadError" role="alert" class="task-panel border-primary!">
      チーム情報を取得できませんでした。通信状態や参加権限を確認して、再読み込みしてください。
    </p>
    <p v-else-if="!isTeamPending && !team" role="status" class="task-panel">
      チームが見つかりません。チーム一覧から選び直してください。
    </p>
    <!-- 人質は1行のバナーにまとめる。説明はⓘに、変更は作成者だけに✏️で出す -->
    <section v-if="team" class="hostage-panel task-panel" aria-labelledby="hostage-heading">
      <div class="hostage-bar">
        <h2 id="hostage-heading" class="hostage-label">
          <Skull :size="18" aria-hidden="true" />人質
        </h2>
        <!-- 自分の期限切れなら「本人」、仲間の期限切れなら「仲間」の称号を「発動中」の見た目にする -->
        <dl v-if="!isEditingHostage" class="hostage-chips">
          <div
            class="hostage-chip"
            :class="{ 'is-active': isSelfDisTitleActive }"
            :title="titleDescription(team.selfDisTitleId)"
          >
            <dt>本人</dt>
            <dd>
              <Flame
                v-if="isSelfDisTitleActive"
                :size="14"
                class="active-mark"
                aria-hidden="true"
              />
              {{ titleName(team.selfDisTitleId) }}
              <span v-if="isSelfDisTitleActive" class="sr-only">（発動中）</span>
            </dd>
          </div>
          <div
            class="hostage-chip"
            :class="{ 'is-active': isTeamDisTitleActive }"
            :title="titleDescription(team.teamDisTitleId)"
          >
            <dt>仲間</dt>
            <dd>
              <Flame
                v-if="isTeamDisTitleActive"
                :size="14"
                class="active-mark"
                aria-hidden="true"
              />
              {{ titleName(team.teamDisTitleId) }}
              <span v-if="isTeamDisTitleActive" class="sr-only">（発動中）</span>
            </dd>
          </div>
        </dl>
        <div class="hostage-actions">
          <p v-if="overdueCount" class="overdue-chip">
            <TriangleAlert :size="14" aria-hidden="true" />期限切れ {{ overdueCount }}件
          </p>
          <div ref="hostageInfo" class="hostage-info">
            <button
              type="button"
              class="hostage-icon-button"
              aria-label="人質のしくみ"
              aria-describedby="hostage-info-text"
              :aria-expanded="isHostageInfoOpen"
              @click="isHostageInfoOpen = !isHostageInfoOpen"
            >
              <Info :size="16" aria-hidden="true" />
            </button>
            <p
              id="hostage-info-text"
              role="tooltip"
              class="hostage-tooltip"
              :class="{ 'is-open': isHostageInfoOpen }"
            >
              タスクをサボると、あなたは「{{ titleName(team.selfDisTitleId) }}」、仲間は「{{
                titleName(team.teamDisTitleId)
              }}」の称号を付けられます。
            </p>
          </div>
          <button
            v-if="isCreator && !isEditingHostage"
            type="button"
            class="hostage-icon-button"
            aria-label="人質を変更"
            title="人質を変更"
            @click="startEditHostage"
          >
            <Pencil :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div v-if="isEditingHostage" class="mt-3 grid gap-3">
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
      </div>
      <!-- エミュレータでは期限切れ判定が自動で動かないので、開発用に小さく出す -->
      <div v-if="canRunOverdueCheck" class="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-0.5 text-xs"
          :disabled="isRunningOverdueCheck"
          @click="runOverdueCheck"
        >
          <Clock :size="12" aria-hidden="true" />
          {{ isRunningOverdueCheck ? '判定中…' : '期限切れを判定（開発用）' }}
        </button>
        <p v-if="overdueCheckError" role="alert" class="text-xs font-bold text-red-600">
          {{ overdueCheckError }}
        </p>
      </div>
    </section>
    <section v-if="team && !loadError" class="task-panel progress-panel">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="font-dot text-sm text-primary">TEAM PROGRESS</h2>
          <span
            class="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-muted px-3 py-1 text-xs font-bold"
          >
            <Users :size="15" aria-hidden="true" />{{ new Set(team.memberIds).size }}人で取り組み中
          </span>
        </div>
        <p class="text-sm font-bold">
          <strong class="font-display text-2xl">{{ completedCount }}</strong> /
          {{ tasks.length }} タスク完了
        </p>
      </div>
      <div
        class="progress-track mt-3"
        role="progressbar"
        aria-label="チーム進捗度"
        :aria-valuenow="teamProgress"
        :aria-valuemin="0"
        :aria-valuemax="100"
      >
        <div class="h-full bg-primary transition-all" :style="{ width: teamProgress + '%' }" />
      </div>
    </section>
    <section v-if="team && !loadError" aria-label="メンバーごとのタスク">
      <div class="mb-5 flex flex-wrap gap-2" role="group" aria-label="タスクの状態で絞り込み">
        <button
          v-for="filter in filters"
          :key="filter.value"
          class="filter-button"
          :class="{ 'is-active': activeFilter === filter.value }"
          :aria-pressed="activeFilter === filter.value"
          @click="activeFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
      <p v-if="taskErrorMessage" role="alert" class="mb-4 text-sm text-red-600">
        {{ taskErrorMessage }}
      </p>
      <p v-if="isTasksPending" role="status" class="mb-4 text-sm">読み込み中…</p>
      <div>
        <div class="member-grid">
          <article
            v-for="card in memberCards"
            :key="card.uid"
            class="member-card task-panel"
            :class="{ 'is-self': card.uid === currentUser?.uid }"
          >
            <header class="flex items-center gap-3">
              <span class="member-avatar" aria-hidden="true">{{
                memberName(card.uid).slice(0, 1)
              }}</span>
              <h3 class="min-w-0 break-words font-bold">
                {{ memberName(card.uid) }}
                <span v-if="card.uid === currentUser?.uid" class="you-badge"
                  >YOU<span class="sr-only">（自分）</span></span
                >
              </h3>
            </header>
            <p
              v-if="card.equippedTitle"
              class="title-badge"
              :title="card.equippedTitle.description"
            >
              ♛ {{ card.equippedTitle.name }}
            </p>
            <div class="mt-4 mb-3">
              <div class="mb-2 flex justify-between gap-2 text-xs">
                <span class="font-dot text-primary">TASKS</span
                ><span class="font-bold">{{ card.done }} / {{ card.total }} 完了</span>
              </div>
              <div class="progress-track" aria-hidden="true">
                <div
                  class="h-full bg-primary"
                  :style="{ width: (card.total ? (card.done / card.total) * 100 : 0) + '%' }"
                />
              </div>
            </div>
            <p v-if="isTasksPending" class="py-4 text-sm text-ink/60">タスクを読み込み中…</p>
            <p v-else-if="!card.tasks.length" class="empty-tasks">
              {{
                card.total
                  ? 'このフィルタに該当するタスクはありません。'
                  : 'タスクはまだありません。'
              }}
            </p>
            <ul v-else class="flex flex-col gap-4">
              <li
                v-for="task in card.tasks"
                :key="task.id"
                class="task-item relative flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink p-4 shadow-sm"
                :class="{
                  'is-done': task.status === 'done',
                  'is-late': isDisplayOverdue(task) || isCompletedLate(task),
                }"
                :data-task-id="task.id"
                @pointerup="onTaskTap($event, task.id)"
              >
                <form
                  v-if="editingTaskId === task.id && task.ownerId === currentUser?.uid"
                  :id="`edit-task-${task.id}`"
                  class="flex w-full flex-col gap-3"
                  @submit.prevent="saveTask(task.id)"
                >
                  <label class="flex flex-col gap-1 text-sm">
                    タスク名
                    <input
                      v-model="editTitle"
                      type="text"
                      maxlength="100"
                      required
                      class="rounded border px-3 py-2"
                      :disabled="!!busyTaskId"
                    />
                  </label>
                  <label class="flex flex-col gap-1 text-sm">
                    期限
                    <input
                      v-model="editDueAt"
                      type="datetime-local"
                      required
                      class="rounded border px-3 py-2"
                      :disabled="!!busyTaskId"
                    />
                  </label>
                </form>
                <div v-else class="min-w-0 basis-full break-words">
                  <div class="task-header">
                    <p class="task-name flex items-start gap-2 font-bold">
                      <!-- 本人のタスクはチェックボックスで完了・未完了を切り替える（Firestoreルールでも本人のみに制限） -->
                      <button
                        v-if="task.ownerId === currentUser?.uid"
                        type="button"
                        role="checkbox"
                        class="task-check is-toggle"
                        :aria-checked="task.status === 'done'"
                        :aria-label="task.status === 'done' ? '未完了に戻す' : '完了にする'"
                        :title="task.status === 'done' ? '未完了に戻す' : '完了にする'"
                        :disabled="!!busyTaskId"
                        @click="onComplete(task)"
                      >
                        <Check
                          :size="16"
                          :stroke-width="3"
                          class="check-mark"
                          :class="{ 'is-checked': task.status === 'done' }"
                          aria-hidden="true"
                        />
                      </button>
                      <!-- 仲間のタスクは状態を見せるだけ -->
                      <span v-else class="task-check" aria-hidden="true">
                        <Check v-if="task.status === 'done'" :size="16" :stroke-width="3" />
                      </span>
                      <span class="min-w-0" :class="{ 'line-through': task.status === 'done' }">
                        {{ task.title }}
                      </span>
                    </p>
                    <div v-if="task.ownerId === currentUser?.uid" class="task-header-actions">
                      <button
                        type="button"
                        class="task-icon-button"
                        aria-label="編集"
                        title="編集"
                        :disabled="!!busyTaskId"
                        @click="startEditTask(task)"
                      >
                        <Pencil :size="16" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="task-icon-button"
                        aria-label="削除"
                        title="削除"
                        :disabled="!!busyTaskId"
                        @click="onDelete(task)"
                      >
                        <Trash2 :size="16" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p class="task-due text-xs">期限: {{ formatDueAt(task.dueAt) }}</p>
                </div>
                <span
                  class="mr-auto rounded-full px-3 py-1 text-xs font-bold"
                  :class="
                    isCompletedLate(task)
                      ? 'bg-late text-on-late'
                      : task.status === 'done'
                        ? 'bg-primary text-white'
                        : isDisplayOverdue(task)
                          ? 'bg-late text-on-late'
                          : 'bg-accent text-ink'
                  "
                  >{{
                    isCompletedLate(task)
                      ? '期限切れ完了'
                      : isDisplayOverdue(task)
                        ? '期限切れ'
                        : statusLabel[task.status]
                  }}</span
                >
                <!-- 証明（写真・PDF）。完了とは独立していて、証明が無くても完了できる -->
                <TaskProofs
                  v-if="editingTaskId !== task.id"
                  :team-id="teamId"
                  :task-id="task.id"
                  :task-title="task.title"
                  :is-owner="task.ownerId === currentUser?.uid"
                />
                <div
                  v-if="task.ownerId === currentUser?.uid && editingTaskId === task.id"
                  class="task-actions"
                >
                  <div class="flex flex-wrap gap-2">
                    <button type="submit" :form="`edit-task-${task.id}`" :disabled="!!busyTaskId">
                      保存
                    </button>
                    <button type="button" :disabled="!!busyTaskId" @click="editingTaskId = null">
                      キャンセル
                    </button>
                  </div>
                </div>
                <!-- リアクション・コメント。メンバー全員が自分のタスクにも仲間のタスクにも付けられる -->
                <TaskFeedback
                  v-if="editingTaskId !== task.id"
                  :team-id="teamId"
                  :task-id="task.id"
                  :is-task-owner="task.ownerId === currentUser?.uid"
                  :toolbar-open="toolbarTaskId === task.id"
                  :member-name="memberName"
                />
              </li>
            </ul>

            <button
              v-if="card.uid === currentUser?.uid && !isCreatingTask"
              class="add-task-button"
              aria-controls="create-task-form"
              :aria-expanded="isCreatingTask"
              @click="isCreatingTask = true"
            >
              <Plus :size="16" />タスクを追加
            </button>
            <form
              v-if="isCreatingTask && card.uid === currentUser?.uid"
              id="create-task-form"
              class="create-panel flex flex-col gap-3"
              @submit.prevent="submit"
            >
              <div>
                <p class="mb-2 font-dot text-xs text-primary">NEW QUEST</p>
                <h2 class="font-display text-lg">自分のタスクを追加</h2>
              </div>
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
                <input
                  v-model="dueAt"
                  type="datetime-local"
                  :min="minDueAt"
                  required
                  class="rounded border px-3 py-2"
                  @focus="refreshMinDueAt"
                />
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
              <button
                type="button"
                class="px-3 py-2 text-sm"
                :disabled="isSubmitting"
                @click="isCreatingTask = false"
              >
                キャンセル
              </button>
            </form>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference '../assets/main.css';
.task-page {
  @apply grid min-w-0 gap-6 text-ink;
}
.task-panel {
  @apply min-w-0 rounded-2xl border-2 border-ink bg-white p-5 shadow-sm;
}
.heading-row {
  @apply flex flex-col justify-between gap-5 sm:flex-row sm:items-center;
}
.heading-icon {
  @apply grid size-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-primary text-white shadow-sm;
}
.invite-chip {
  @apply flex w-fit items-center gap-1 rounded-full border border-ink/30 bg-white/70 py-0.5 pr-0.5 pl-3 text-xs text-ink/70;
}
.task-page .invite-copy {
  @apply grid size-7 place-items-center rounded-full border-0 bg-transparent p-0 text-ink/70 hover:bg-muted/50 hover:text-ink;
}
.deadline-card {
  @apply shrink-0 rounded-2xl border-2 border-ink bg-ink p-4 text-center text-accent shadow-sm;
}
.hostage-panel {
  @apply bg-accent px-4 py-3 font-bold;
}
.hostage-panel :deep(select) {
  font-weight: 700;
}
.hostage-bar {
  @apply flex flex-wrap items-center gap-x-3 gap-y-2;
}
.hostage-label {
  @apply flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1 font-display text-sm text-accent;
}
.hostage-chips {
  @apply flex min-w-0 flex-wrap items-center gap-2;
}
.hostage-chip {
  @apply flex min-w-0 items-center gap-1.5 rounded-full border-2 border-ink bg-white py-0.5 pr-3 pl-1 text-sm;
}
.hostage-chip dt {
  @apply shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal;
}
.hostage-chip dd {
  @apply flex min-w-0 items-center gap-1 break-words;
}
/* 発動中：黒地に黄色文字へ反転し、炎のマークを点滅させて「今まさに付いている」感を出す */
.hostage-chip.is-active {
  @apply bg-ink text-accent;
  box-shadow: 0 0 0 3px var(--color-on-late);
}
.hostage-chip.is-active dt {
  @apply bg-accent font-bold text-ink;
}
.active-mark {
  @apply shrink-0 animate-pulse text-orange-400; /* 黒地でも見えるよう明るいオレンジにする */
}
.hostage-actions {
  @apply ml-auto flex shrink-0 items-center gap-1.5;
}
.overdue-chip {
  @apply flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs text-accent;
}
.hostage-info {
  @apply relative;
}
.task-page .hostage-icon-button {
  @apply grid size-8 place-items-center rounded-full p-0;
}
/* ⓘの説明：カーソルを合わせたとき・フォーカスしたとき・タップで開いたときに出す */
.hostage-tooltip {
  @apply invisible absolute top-full right-0 z-30 mt-2 w-64 max-w-[80vw] rounded-2xl border-2 border-ink bg-white p-3 text-xs leading-relaxed font-normal text-ink opacity-0 shadow-sm transition;
}
.hostage-info:hover .hostage-tooltip,
.hostage-info:focus-within .hostage-tooltip,
.hostage-tooltip.is-open {
  @apply visible opacity-100;
}
.progress-track {
  @apply h-2 overflow-hidden rounded-full border border-ink bg-canvas;
}
.progress-panel .progress-track {
  @apply h-3;
}
.member-grid {
  @apply grid min-w-0 items-start gap-6 md:grid-cols-2 xl:grid-cols-3;
}

.member-card.is-self {
  @apply border-primary;
  box-shadow: 0 5px 0 var(--color-primary);
}
.member-avatar {
  @apply grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-muted font-display;
}
.is-self .member-avatar {
  @apply bg-accent;
}
.you-badge {
  @apply inline-block rounded-full bg-primary px-2 py-1 align-middle text-xs text-white;
}
.title-badge {
  @apply mt-3 w-fit max-w-full break-words rounded-full border border-ink bg-accent px-2 py-1 text-xs font-bold;
}
.empty-tasks {
  @apply rounded-xl border border-dashed border-muted p-4 text-sm text-ink/60;
}
.create-panel {
  @apply mt-4 border-t-2 border-dashed border-primary pt-4;
}
.task-page input {
  @apply w-full min-w-0 rounded-xl border-2 border-muted bg-canvas px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20;
}
.task-page button {
  @apply cursor-pointer rounded-xl border-2 border-ink bg-white font-bold transition hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50;
}
.task-page .filter-button {
  @apply rounded-full px-4 py-2 text-xs;
}
.task-page .filter-button.is-active {
  @apply bg-ink text-accent;
}
.task-page .add-task-button {
  @apply mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-dashed border-primary p-3 text-sm text-primary;
}
.create-panel button[type='submit'] {
  @apply bg-accent py-3 shadow-sm hover:bg-accent/80;
}
.task-item {
  @apply gap-2 rounded-xl bg-white p-3 text-sm text-ink;
}
.task-item.is-late {
  @apply bg-ink text-white;
}
.task-check {
  @apply inline-flex size-5 shrink-0 items-center justify-center rounded border-2 border-ink bg-white text-ink;
}
/* 押せるチェックボックス。小さいと押しにくいので、少し大きくして押せそうな見た目にする */
.task-item .task-check.is-toggle {
  @apply size-6 cursor-pointer rounded-md p-0 shadow-sm transition hover:-translate-y-0.5 hover:bg-accent/40 disabled:cursor-not-allowed;
}
/* 未完了のときは、カーソルを合わせるとうっすらチェックを見せて「押すと完了」と分かるようにする */
.check-mark {
  @apply opacity-0 transition;
}
.task-check.is-toggle:hover .check-mark,
.check-mark.is-checked {
  @apply opacity-100;
}
.is-done .task-check {
  @apply bg-accent text-ink;
}
.task-due {
  @apply text-ink/60;
}
.is-done .task-due {
  @apply text-muted;
}
.is-late .task-due {
  @apply text-late;
}
.task-item input {
  @apply text-ink;
}
.task-item button {
  @apply px-2 py-1 text-xs text-ink hover:bg-muted;
}
.task-actions {
  @apply flex w-full flex-wrap items-center gap-2;
}
.task-header {
  @apply mb-2 flex flex-wrap items-start gap-2;
}
.task-name {
  @apply min-w-0 flex-1 basis-24;
}
.task-header-actions {
  @apply ml-auto flex shrink-0 gap-2;
}
.task-actions button {
  @apply min-h-11;
}
.task-item .task-icon-button {
  @apply flex size-9 shrink-0 items-center justify-center p-0;
}
/* リアクション・コメントの吹き出し（TaskReactionToolbar）は、カーソルを合わせたとき・フォーカスしたときに出す */
.task-item:hover :deep(.reaction-toolbar),
.task-item:focus-within :deep(.reaction-toolbar) {
  @apply visible opacity-100;
}
</style>
