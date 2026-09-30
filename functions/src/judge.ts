/**
 * 称号判定（担当：key）
 * ⚠ スタブです。入出力の形だけ本番と同じにしてあり、Firestoreには何も書き込みません。
 * フロントはこの形を前提に画面を作れるので、中身を差し替えても呼び出し側は変更不要です。
 */
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { judgeOverdueTasksInput, type JudgeOverdueTasksOutput } from '@hitojichi/shared'

/** デモ用：チームを指定して今すぐ判定する */
export const judgeOverdueTasks = onCall(async (request): Promise<JudgeOverdueTasksOutput> => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です')

  const parsed = judgeOverdueTasksInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'teamId が必要です')

  const db = getFirestore()
  const teamDoc = await db.collection('teams').doc(parsed.data.teamId).get()
  if (!teamDoc.exists) throw new HttpsError('not-found', 'チームが見つかりません')
  const memberIds: string[] = teamDoc.get('memberIds') ?? []
  if (!memberIds.includes(uid))
    throw new HttpsError('permission-denied', 'チームのメンバーではありません')

  // TODO(key): ここから本実装に置き換える
  // 1. teams/{teamId}/tasks から status == 'todo' かつ dueAt < 現在時刻 のタスクを探す
  //    （この検索用の複合インデックスは firestore.indexes.json に登録済み）
  // 2. 見つかったタスクを status: 'overdue' に更新する
  // 3. タスクの ownerId（サボった本人）の users/{uid}.titleIds に team.selfDisTitleId を追加する
  //    ほかのメンバー全員には team.teamDisTitleId を追加する（FieldValue.arrayUnion で重複しない）
  //    方針：初回はチームの人質の組を付け、サボりを重ねるとより不名誉な称号に格上げする
  //    格上げしたときは previousTitleId に格上げ前の称号を入れる（フロントの演出で使う）
  // 4. 付与するたびに teams/{teamId}/titleEvents に記録を追加する（createdAt は FieldValue.serverTimestamp()）
  // 5. 2〜4 は db.batch() でまとめて書き込むと、途中で失敗しても中途半端な状態にならない
  // 判定処理は関数に切り出しておくと、あとで onSchedule（定期実行）からも同じ処理を呼べる
  // TODO(key): 余裕があれば onSchedule（firebase-functions/v2/scheduler）版を追加する

  // スタブ：呼び出した本人がサボった想定のサンプルを返す（書き込みはしない）
  return {
    overdueTaskIds: ['stub-task'],
    awarded: [
      {
        uid,
        titleId: teamDoc.get('selfDisTitleId'),
        previousTitleId: null,
        kind: 'self',
        causedBy: uid,
        taskId: 'stub-task',
      },
    ],
  }
})
