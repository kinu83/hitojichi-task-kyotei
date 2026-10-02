import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  type CollectionReference,
} from 'firebase/firestore'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useCollection, useCurrentUser } from 'vuefire'
import { db } from '@/lib/firebase'
import { createCommentInput, type Comment, type CreateCommentInput } from '@hitojichi/shared'

function commentsCollection(teamId: string, taskId: string) {
  return collection(
    db,
    'teams',
    teamId,
    'tasks',
    taskId,
    'comments',
  ) as CollectionReference<Comment>
}

/** タスク削除の前に呼び、仲間が書いたコメントもまとめて消す（自動では消えない） */
export async function deleteAllTaskComments(teamId: string, taskId: string) {
  const snapshot = await getDocs(commentsCollection(teamId, taskId))
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)))
}

/** タスクへのコメントの一覧（古い順）と、書く・消すをまとめたcomposable */
export function useTaskComments(
  teamId: MaybeRefOrGetter<string>,
  taskId: MaybeRefOrGetter<string>,
) {
  const currentUser = useCurrentUser()
  // 送信直後（サーバー時刻の確定前）も一覧に出すため、時刻は推定値で埋める
  const comments = useCollection<Comment>(
    computed(() =>
      query(commentsCollection(toValue(teamId), toValue(taskId)), orderBy('createdAt', 'asc')),
    ),
    { snapshotOptions: { serverTimestamps: 'estimate' } },
  )

  async function addComment(input: CreateCommentInput) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    const { text } = createCommentInput.parse(input)
    await addDoc(commentsCollection(toValue(teamId), toValue(taskId)), {
      authorId: uid,
      text,
      createdAt: serverTimestamp(),
    })
  }

  async function deleteComment(commentId: string) {
    await deleteDoc(doc(commentsCollection(toValue(teamId), toValue(taskId)), commentId))
  }

  return { comments, addComment, deleteComment }
}
