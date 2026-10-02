import {
  addDoc,
  collection,
  doc,
  runTransaction,
  Timestamp,
  updateDoc,
  type CollectionReference,
} from 'firebase/firestore'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useCollection, useCurrentUser, useDocument } from 'vuefire'
import { db } from '@/lib/firebase'
import { deleteAllTaskProofs } from '@/composables/useTaskProofs'
import { deleteAllTaskReactions } from '@/composables/useTaskReactions'
import { deleteAllTaskComments } from '@/composables/useTaskComments'
import {
  taskSchema,
  updateTaskInput,
  updateTeamHostageInput,
  type CreateTaskInput,
  type Task,
  type UpdateTaskInput,
  type Team,
  type UpdateTeamHostageInput,
} from '@hitojichi/shared'

/** チーム詳細（メンバー・人質）とチーム内タスクの取得・作成・状態更新をまとめたcomposable */
export function useTeamTasks(teamId: MaybeRefOrGetter<string>) {
  const currentUser = useCurrentUser()

  const teamRef = computed(() => doc(db, 'teams', toValue(teamId)))
  const team = useDocument<Team>(teamRef)

  const tasksRef = computed(
    () => collection(db, 'teams', toValue(teamId), 'tasks') as CollectionReference<Task>,
  )
  const tasks = useCollection<Task>(tasksRef)

  // チーム進捗度：メンバー全員のタスクを合算した完了率（0〜100、タスクが無ければ0）
  const teamProgress = computed(() => {
    const total = tasks.value.length
    if (total === 0) return 0
    const done = tasks.value.filter((task) => task.status === 'done').length
    return Math.round((done / total) * 100)
  })

  // 人質（称号の組）を変更できるのはチーム作成者だけ
  const isCreator = computed(
    () => !!currentUser.value && team.value?.createdBy === currentUser.value.uid,
  )

  /** 自分のタスクとして追加する（タスクは個人が自分で管理するもの） */
  async function createTask(input: CreateTaskInput) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')

    const task = taskSchema.parse({ ...input, ownerId: uid, status: 'todo', completedLate: false })
    if (task.dueAt.getTime() <= Date.now()) throw new Error('期限は現在より未来にしてください')
    await addDoc(collection(db, 'teams', toValue(teamId), 'tasks'), task)
  }

  async function setTaskStatus(taskId: string, status: 'todo' | 'done') {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    const taskRef = doc(db, 'teams', toValue(teamId), 'tasks', taskId)
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(taskRef)
      if (!snapshot.exists()) throw new Error('タスクが見つかりません')
      const task = snapshot.data()
      if (task.ownerId !== uid) throw new Error('自分のタスクのみ状態変更できます')
      if (task.status === status) return
      if (!(
        (status === 'done' && (task.status === 'todo' || task.status === 'overdue')) ||
        (status === 'todo' && task.status === 'done')
      ))
        throw new Error('この状態変更はできません')
      const dueAt = task.dueAt instanceof Timestamp ? task.dueAt.toDate() : task.dueAt
      transaction.update(taskRef, {
        status,
        completedLate:
          status === 'done' && (task.status === 'overdue' || dueAt.getTime() <= Date.now()),
      })
    })
  }

  /** 最新の所有者を確認し、編集では状態を上書きしない。 */
  async function updateTask(taskId: string, input: UpdateTaskInput) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    const changes = updateTaskInput.parse(input)
    const taskRef = doc(db, 'teams', toValue(teamId), 'tasks', taskId)
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(taskRef)
      if (!snapshot.exists()) throw new Error('タスクが見つかりません')
      if (snapshot.data().ownerId !== uid) throw new Error('自分のタスクのみ編集できます')
      transaction.update(taskRef, changes)
    })
  }

  async function deleteTask(taskId: string) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    const taskRef = doc(db, 'teams', toValue(teamId), 'tasks', taskId)
    // 証明・リアクション・コメントはタスクの持ち主かどうかをルールで確かめるので、
    // タスクより先に消す（サブコレクションは自動では消えない）
    await Promise.all([
      deleteAllTaskProofs(toValue(teamId), taskId),
      deleteAllTaskReactions(toValue(teamId), taskId),
      deleteAllTaskComments(toValue(teamId), taskId),
    ])
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(taskRef)
      if (!snapshot.exists()) throw new Error('タスクが見つかりません')
      if (snapshot.data().ownerId !== uid) throw new Error('自分のタスクのみ削除できます')
      transaction.delete(taskRef)
    })
  }

  async function updateHostage(input: UpdateTeamHostageInput) {
    const hostage = updateTeamHostageInput.parse(input)
    await updateDoc(doc(db, 'teams', toValue(teamId)), hostage)
  }

  return {
    team,
    tasks,
    teamProgress,
    isCreator,
    createTask,
    setTaskStatus,
    updateTask,
    deleteTask,
    updateHostage,
  }
}
