import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type CollectionReference,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage'
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useCollection, useCurrentUser } from 'vuefire'
import { db, storage } from '@/lib/firebase'
import { compressImage } from '@/lib/compressImage'
import {
  createProofInput,
  isAllowedProofContentType,
  MAX_PROOF_FILE_SIZE,
  proofSchema,
  type CreateProofInput,
  type Proof,
} from '@hitojichi/shared'

function proofsCollection(teamId: string, taskId: string) {
  return collection(db, 'teams', teamId, 'tasks', taskId, 'proofs') as CollectionReference<Proof>
}

/** Storageのファイル→Firestoreのメタデータの順に消す（逆だとルールでファイルを消せなくなる場合がある） */
async function removeProof(teamId: string, taskId: string, proofId: string, storagePath: string) {
  try {
    await deleteObject(storageRef(storage, storagePath))
  } catch (error) {
    // ファイルだけ先に消えていた場合も、メタデータは消して表示を整える
    if ((error as { code?: string }).code !== 'storage/object-not-found') throw error
  }
  await deleteDoc(doc(proofsCollection(teamId, taskId), proofId))
}

/** タスク削除の前に呼び、証明（ファイルとメタデータ）をまとめて消す */
export async function deleteAllTaskProofs(teamId: string, taskId: string) {
  const snapshot = await getDocs(proofsCollection(teamId, taskId))
  await Promise.all(
    snapshot.docs.map((entry) => removeProof(teamId, taskId, entry.id, entry.data().storagePath)),
  )
}

/** タスクの証明（写真・PDF）の一覧・追加・削除をまとめたcomposable */
export function useTaskProofs(teamId: MaybeRefOrGetter<string>, taskId: MaybeRefOrGetter<string>) {
  const currentUser = useCurrentUser()

  const proofsQuery = computed(() =>
    query(proofsCollection(toValue(teamId), toValue(taskId)), orderBy('createdAt', 'desc')),
  )
  // 追加直後（サーバー時刻の確定前）も一覧に出すため、時刻は推定値で埋める
  const proofs = useCollection<Proof>(proofsQuery, {
    snapshotOptions: { serverTimestamps: 'estimate' },
  })

  // 表示用のダウンロードURL（証明ID → URL）。新しく増えた証明の分だけ取得する
  const downloadUrls = ref<Record<string, string>>({})
  watch(
    () => proofs.value.map((proof) => ({ id: proof.id, path: proof.storagePath })),
    (entries) => {
      for (const { id, path } of entries) {
        if (downloadUrls.value[id]) continue
        getDownloadURL(storageRef(storage, path))
          .then((url) => (downloadUrls.value[id] = url))
          .catch((error) => console.error(error))
      }
    },
    { immediate: true },
  )

  const uploadProgress = ref<number | null>(null) // 0〜100。アップロード中以外はnull

  /** ファイルをStorageへ上げてから、Firestoreにメタデータを書く */
  async function uploadProof(original: File, input: CreateProofInput = {}) {
    const uid = currentUser.value?.uid
    if (!uid) throw new Error('ログインが必要です')
    if (!isAllowedProofContentType(original.type)) throw new Error('写真またはPDFを選んでください')
    const { note } = createProofInput.parse(input)

    const file = await compressImage(original)
    if (file.size > MAX_PROOF_FILE_SIZE) throw new Error('ファイルは10MB以下にしてください')

    const proofRef = doc(proofsCollection(toValue(teamId), toValue(taskId)))
    const storagePath = proofRef.path // Firestoreと同じパスに置くと、ルールで対応を確かめやすい
    const metadata = proofSchema.omit({ createdAt: true }).parse({
      uploaderId: uid,
      storagePath,
      fileName: file.name.slice(0, 200) || 'proof',
      contentType: file.type,
      size: file.size,
      ...(note ? { note } : {}),
    })

    const fileRef = storageRef(storage, storagePath)
    uploadProgress.value = 0
    try {
      const task = uploadBytesResumable(fileRef, file, { contentType: file.type })
      task.on('state_changed', (snapshot) => {
        uploadProgress.value = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
      })
      await task
      try {
        await setDoc(proofRef, { ...metadata, createdAt: serverTimestamp() })
      } catch (error) {
        // メタデータを書けなかったファイルは誰からも見えないので消しておく
        await deleteObject(fileRef).catch(() => {})
        throw error
      }
    } finally {
      uploadProgress.value = null
    }
  }

  async function deleteProof(proof: Proof & { id: string }) {
    await removeProof(toValue(teamId), toValue(taskId), proof.id, proof.storagePath)
  }

  return { proofs, downloadUrls, uploadProgress, uploadProof, deleteProof }
}
