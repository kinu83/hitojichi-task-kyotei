// seed/titles.jsonを称号マスタ(titles)へ反映し、既存のID・ユーザー・チームは保持する。
// エミュレータ：共有seedに保存する場合は、emulators:execの--import seed --export-on-exit seedと併用する。
// 本番：npm run titles:prod で差分を確認し、npm run titles:prod -- --yes で書き込む。
//   管理者権限が必要なので、GOOGLE_APPLICATION_CREDENTIALS にサービスアカウントの鍵のパスを渡す。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const isProd = process.argv.includes('--prod')
const isConfirmed = process.argv.includes('--yes')

function prodProjectId() {
  const rc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../.firebaserc'), 'utf8'))
  const projectId = rc.projects?.prod
  assert.ok(projectId, '.firebaserc に prod のプロジェクトがありません')
  return projectId
}

async function main() {
  let options
  if (isProd) {
    // エミュレータ用の環境変数が残っていると、本番のつもりでエミュレータへ書いてしまう
    assert.ok(
      !process.env.FIRESTORE_EMULATOR_HOST,
      '本番ではFIRESTORE_EMULATOR_HOSTを外してください',
    )
    assert.ok(
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      'GOOGLE_APPLICATION_CREDENTIALSに鍵のパスを指定してください',
    )
    options = { projectId: prodProjectId() }
  } else {
    // 管理者権限の投入処理なので、本番への誤接続は開始前に拒否する。
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore Emulatorが必要です')
    assert.ok(process.env.GCLOUD_PROJECT?.startsWith('demo-'), 'デモプロジェクトで実行してください')
  }
  const titles = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../seed/titles.json'), 'utf8'),
  )
  const app = initializeApp(options)
  try {
    const db = getFirestore(app)
    if (isProd) {
      // 書き込む前に、本番の現状と反映内容を見せる（既存の称号は消さない）
      const existing = await db.collection('titles').get()
      const existingIds = new Set(existing.docs.map((doc) => doc.id))
      console.log(`対象プロジェクト: ${options.projectId}`)
      console.log(
        `本番の称号: ${existing.size}件（kindなし: ${existing.docs.filter((doc) => !doc.get('kind')).length}件）`,
      )
      for (const { id, kind, name } of titles)
        console.log(`  ${existingIds.has(id) ? '更新' : '追加'} ${id} [${kind}] ${name}`)
      if (!isConfirmed) {
        console.log('確認のみで終了しました。書き込むには --yes を付けて実行してください。')
        return
      }
    }
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
