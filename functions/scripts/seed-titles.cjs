// seed/titles.jsonをエミュレータへ反映し、既存のID・ユーザー・チームは保持する。
// 共有seedに保存する場合は、emulators:execの--import seed --export-on-exit seedと併用する。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

async function main() {
  // 管理者権限の投入処理なので、本番への誤接続は開始前に拒否する。
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore Emulatorが必要です')
  assert.ok(process.env.GCLOUD_PROJECT?.startsWith('demo-'), 'デモプロジェクトで実行してください')
  const titles = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../seed/titles.json'), 'utf8'),
  )
  const app = initializeApp()
  try {
    const db = getFirestore(app)
    const batch = db.batch()
    for (const { id, ...title } of titles) batch.set(db.doc(`titles/${id}`), title)
    await batch.commit()
    console.log(`称号マスタ${titles.length}件を反映しました`)
  } finally {
    await deleteApp(app)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
