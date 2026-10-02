import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type CollectionReference,
} from 'firebase/firestore'
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useCollection, useCurrentUser } from 'vuefire'
import { db } from '@/lib/firebase'
import {
  reactionSchema,
  reactionTypeSchema,
  type Reaction,
  type ReactionType,
} from '@hitojichi/shared'

function reactionsCollection(teamId: string, taskId: string) {
  return collection(
    db,
    'teams',
    teamId,
    'tasks',
    taskId,
    'reactions',
  ) as CollectionReference<Reaction>
}

/** タスク削除の前に呼び、仲間が付けたリアクションもまとめて消す（自動では消えない） */
export async function deleteAllTaskReactions(teamId: string, taskId: string) {
  const snapshot = await getDocs(reactionsCollection(teamId, taskId))
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)))
}

export type ReactionSummary = { type: ReactionType; userIds: string[]; isMine: boolean }

/** タスクへのリアクションの一覧と、付ける・取り消すをまとめたcomposable */
export function useTaskReactions(
  teamId: MaybeRefOrGetter<string>,
  taskId: MaybeRefOrGetter<string>,
) {
  const currentUser = useCurrentUser()
  const reactions = useCollection<Reaction>(
    computed(() => reactionsCollection(toValue(teamId), toValue(taskId))),
  )

  // 種類ごとに誰が付けたかをまとめる（付いていない種類は含めない）
  const summaries = computed<ReactionSummary[]>(() =>
    reactionTypeSchema.options
      .map((type) => {
        const userIds = reactions.value
          .filter((reaction) => reaction.type === type)
          .map((reaction) => reaction.userId)
        return { type, userIds, isMine: userIds.includes(currentUser.value?.uid ?? '') }
      })
      .filter((summary) => summary.userIds.length > 0),
  )

  const busyType = ref<ReactionType | null>(null)

  /** 自分が付けていれば取り消し、付けていなければ付ける */
  async function toggleReaction(type: ReactionType) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    if (busyType.value) return
    // IDを「uid_種類」に固定しているので、同じ人が同じリアクションを重ねて付けられない
    const reactionRef = doc(reactionsCollection(toValue(teamId), toValue(taskId)), `${uid}_${type}`)
    const isMine = reactions.value.some(
      (reaction) => reaction.userId === uid && reaction.type === type,
    )
    busyType.value = type
    try {
      if (isMine) {
        await deleteDoc(reactionRef)
      } else {
        const reaction = reactionSchema.omit({ createdAt: true }).parse({ userId: uid, type })
        await setDoc(reactionRef, { ...reaction, createdAt: serverTimestamp() })
      }
    } finally {
      busyType.value = null
    }
  }

  return { summaries, busyType, toggleReaction }
}
