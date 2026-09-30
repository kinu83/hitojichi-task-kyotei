/**
 * 招待コードでチームに参加する（担当：tsubaki）
 * メンバー以外はFirestoreルールでチームを読めないため、Functions（管理者権限）で探して追加する。
 * TODO(tsubaki): エミュレータで動作確認する（正しいコード／存在しないコード／参加済み）
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { joinTeamInput, type JoinTeamOutput } from '@hitojichi/shared'

export const joinTeam = onCall(async (request): Promise<JoinTeamOutput> => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です')

  const parsed = joinTeamInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', '招待コードは6文字です')

  // getFirestore() はハンドラ内で呼ぶ（index.ts の initializeApp() より先に実行されないように）
  const db = getFirestore()
  const snapshot = await db
    .collection('teams')
    .where('inviteCode', '==', parsed.data.inviteCode)
    .limit(1)
    .get()
  const teamDoc = snapshot.docs[0]
  if (!teamDoc) throw new HttpsError('not-found', '招待コードに一致するチームがありません')

  const memberIds: string[] = teamDoc.get('memberIds') ?? []
  if (memberIds.includes(uid)) throw new HttpsError('already-exists', 'すでにメンバーです')

  // arrayUnion は同時に複数人が参加しても上書きし合わない
  await teamDoc.ref.update({ memberIds: FieldValue.arrayUnion(uid) })
  return { teamId: teamDoc.id, teamName: teamDoc.get('name') }
})
