/**
 * Cloud Functions（v2）のエントリーポイント。
 * AIにコードを書かせるときは「firebase-functions v2（firebase-functions/v2/...）」と指定すること。
 * 各Functionの中身は担当ごとのファイルに書き、ここでは公開（export）だけする。
 */
import { initializeApp } from 'firebase-admin/app'
import { onCall } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'

initializeApp()
setGlobalOptions({ region: 'asia-northeast1' })

/** 疎通確認用。フロントから呼べることを確認したら消してOK */
export const ping = onCall(() => ({ message: 'pong' }))

export { joinTeam } from './joinTeam' // 担当：tsubaki
export { judgeOverdueTasks } from './judge' // 担当：key
