// 専用のAuth / Firestore Emulatorで、大目標の入力契約と保存ルールを検証する。
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app')
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore')
const { initializeApp, deleteApp } = require('firebase/app')
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth')
const {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteField,
} = require('firebase/firestore')

async function main() {
  const projectId = 'demo-task-crud-tests'
  assert.equal(process.env.GCLOUD_PROJECT, projectId)
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST)
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  const output = path.resolve(__dirname, '../lib/team-goal-test.cjs')
  buildSync({
    entryPoints: [path.resolve(__dirname, '../../shared/schemas.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: output,
  })
  const { createTeamInput, teamSchema } = require(output)
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, 'team-goal')
  const admin = initializeAdmin({ projectId }, 'team-goal-admin')
  try {
    // チーム作成時の称号種別チェックに必要なマスタを用意し、目標の検証と分離する。
    const titles = getAdminFirestore(admin).collection('titles')
    await Promise.all([
      titles.doc('self').set({ kind: 'self' }),
      titles.doc('team').set({ kind: 'team' }),
      titles.doc('changed').set({ kind: 'self' }),
    ])
    const auth = getAuth(app)
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    })
    const { user } = await signInAnonymously(auth)
    const db = getFirestore(app)
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    connectFirestoreEmulator(db, host, Number(port))
    const legacy = {
      name: '大目標の検証',
      memberIds: [user.uid],
      inviteCode: 'GOALQA',
      createdBy: user.uid,
      selfDisTitleId: 'self',
      teamDisTitleId: 'team',
    }
    const team = { ...legacy, goal: '動くアプリを完成させる', goalDueDate: '2026-10-01' }
    assert.equal(
      createTeamInput.parse({ ...team, goal: '  動くアプリを完成させる  ' }).goal,
      team.goal,
    )
    const teamRef = doc(collection(db, 'teams'))
    await setDoc(teamRef, team)
    const saved = (await getDoc(teamRef)).data()
    assert.equal(saved.goal, team.goal)
    assert.equal(saved.goalDueDate, '2026-10-01')
    assert.equal(teamSchema.safeParse(saved).success, true)

    const denied = (promise) =>
      assert.rejects(promise, (error) => error.code === 'permission-denied')
    const invalid = [
      ['大目標なし', { ...legacy, goalDueDate: team.goalDueDate }],
      ['期限なし', { ...legacy, goal: team.goal }],
      ['空の大目標', { ...team, goal: '' }],
      ['空白だけの大目標', { ...team, goal: ' \n　 ' }],
      ['長すぎる大目標', { ...team, goal: 'あ'.repeat(121) }],
      ['大目標の型違い', { ...team, goal: 123 }],
      ['空の期限', { ...team, goalDueDate: '' }],
      ['期限の型違い', { ...team, goalDueDate: 20261001 }],
      ['日付以外の期限', { ...team, goalDueDate: '2026-10-01T00:00:00Z' }],
      ['存在しない月', { ...team, goalDueDate: '2026-13-01' }],
      ['存在しない日', { ...team, goalDueDate: '2026-04-31' }],
      ['平年の2月29日', { ...team, goalDueDate: '2026-02-29' }],
      ['100年例外の2月29日', { ...team, goalDueDate: '1900-02-29' }],
    ]
    for (const [label, data] of invalid) {
      assert.equal(createTeamInput.safeParse(data).success, false, label)
      await denied(setDoc(doc(collection(db, 'teams')), data))
    }
    for (const date of ['2028-02-29', '2000-02-29', '2400-02-29', '2026-04-30']) {
      assert.equal(createTeamInput.safeParse({ ...team, goalDueDate: date }).success, true)
      await updateDoc(teamRef, { goalDueDate: date })
      assert.equal((await getDoc(teamRef)).data().goalDueDate, date)
    }
    await denied(updateDoc(teamRef, { goal: '' }))
    await denied(updateDoc(teamRef, { goalDueDate: '2026-02-30' }))
    await denied(updateDoc(teamRef, { goal: deleteField() }))
    await denied(updateDoc(teamRef, { goalDueDate: deleteField() }))
    console.log('PASS: 大目標・期限の必須入力、空白・長さ・型・暦日・うるう年、保存と更新時の保護')

    // 既存チームには後付け必須にせず、称号の変更など従来の操作を維持する。
    const legacyRef = getAdminFirestore(admin).collection('teams').doc()
    await legacyRef.set({ ...legacy, description: '以前のチーム説明' })
    const oldRef = doc(db, legacyRef.path)
    assert.equal(teamSchema.safeParse((await getDoc(oldRef)).data()).success, true)
    await updateDoc(oldRef, { selfDisTitleId: 'changed' })
    await denied(updateDoc(oldRef, { goal: team.goal }))
    await updateDoc(oldRef, { goal: team.goal, goalDueDate: team.goalDueDate })
    assert.equal((await getDoc(oldRef)).data().goal, team.goal)
    console.log('PASS: 既存チームの読み込み・称号変更、大目標と期限の一括設定')
  } finally {
    await deleteApp(app)
    await deleteAdmin(admin)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
