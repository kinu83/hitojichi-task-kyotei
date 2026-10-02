// 専用エミュレータで、本人・巻き添えの取り違え防止と従来の称号付与を検証する。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { buildSync } = require('esbuild')
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app')
const { getFirestore: getAdminFirestore, Timestamp } = require('firebase-admin/firestore')
const { initializeApp, deleteApp } = require('firebase/app')
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth')
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
} = require('firebase/firestore')

async function main() {
  const projectId = 'demo-task-crud-tests'
  assert.equal(process.env.GCLOUD_PROJECT, projectId)
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST)
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  const helpers = [
    '../../shared/schemas.ts',
    '../src/overdueTasks.ts',
    '../src/achievementTitles.ts',
  ]
  for (const [index, helper] of helpers.entries()) {
    buildSync({
      entryPoints: [path.resolve(__dirname, helper)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: path.resolve(__dirname, `../lib/title-kinds-${index}.cjs`),
      external: ['firebase-admin', 'firebase-functions'],
    })
  }
  const { titleSchema, isAchievementTitle } = require('../lib/title-kinds-0.cjs')
  const { processOverdueTask } = require('../lib/title-kinds-1.cjs')
  const { grantAchievementTitles } = require('../lib/title-kinds-2.cjs')
  const titles = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../seed/titles.json'), 'utf8'),
  )
  const byId = new Map(titles.map((title) => [title.id, title]))
  assert.equal(byId.size, titles.length, 'マスタIDは重複しない')
  for (const title of titles) {
    titleSchema.parse(title)
    if (title.kind === 'self') {
      assert.ok(title.recommendedTeamTitleIds.length > 0, '本人用にはおすすめの組がある')
      for (const id of title.recommendedTeamTitleIds) assert.equal(byId.get(id)?.kind, 'team')
    }
    assert.equal(isAchievementTitle(title), title.id.startsWith('achievement-'))
  }
  assert.equal(titleSchema.safeParse({ name: '未分類', description: '旧マスタ' }).success, false)
  assert.equal(
    titleSchema.safeParse({ name: '旧dis', description: '旧マスタ', kind: 'dis' }).success,
    false,
  )

  const admin = initializeAdmin({ projectId }, 'title-kinds-admin')
  const db = getAdminFirestore(admin)
  const apps = []
  async function client(name) {
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, name)
    apps.push(app)
    const auth = getAuth(app)
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    })
    const { user } = await signInAnonymously(auth)
    const clientDb = getFirestore(app)
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    connectFirestoreEmulator(clientDb, host, Number(port))
    await db.doc(`users/${user.uid}`).set({ displayName: name, photoURL: null, titleIds: [] })
    return { uid: user.uid, db: clientDb }
  }
  const denied = (promise) => assert.rejects(promise, (error) => error.code === 'permission-denied')
  try {
    const batch = db.batch()
    for (const { id, ...title } of titles) batch.set(db.doc(`titles/${id}`), title)
    batch.set(db.doc('titles/unclassified'), { name: '未分類', description: '旧マスタ' })
    await batch.commit()
    const owner = await client('title-owner')
    const member = await client('title-member')
    const data = {
      name: '称号の種類の検証',
      goal: '本人と巻き添えを区別する',
      goalDueDate: '2026-12-31',
      memberIds: [owner.uid],
      createdBy: owner.uid,
      inviteCode: 'TITLEQA',
      selfDisTitleId: 'deadline-breaker',
      teamDisTitleId: 'deadline-refugee',
    }
    const teamRef = db.collection('teams').doc()
    const ownerRef = doc(owner.db, teamRef.path)
    await setDoc(ownerRef, data)
    // おすすめは制約ではなく候補。別の仲間用称号への変更も許可する。
    await updateDoc(ownerRef, { teamDisTitleId: 'poor-hostage' })
    for (const invalid of [
      { selfDisTitleId: 'hostage-victim' },
      { teamDisTitleId: 'sabori-master' },
      { selfDisTitleId: 'achievement-1' },
      { teamDisTitleId: 'achievement-5' },
      { selfDisTitleId: 'unclassified' },
      { teamDisTitleId: 'missing' },
      { selfDisTitleId: 'hostage-victim', teamDisTitleId: 'deadline-breaker' },
    ]) {
      await denied(
        setDoc(doc(owner.db, `teams/${db.collection('teams').doc().id}`), { ...data, ...invalid }),
      )
      await denied(updateDoc(ownerRef, invalid))
    }
    await updateDoc(ownerRef, { selfDisTitleId: 'tomorrow-me', teamDisTitleId: 'cleanup-crew' })
    await teamRef.update({ memberIds: [owner.uid, member.uid] })
    await denied(updateDoc(doc(member.db, teamRef.path), { selfDisTitleId: 'sabori-master' }))
    await denied(updateDoc(doc(owner.db, 'titles/hostage-victim'), { kind: 'self' }))
    await updateDoc(doc(member.db, teamRef.path), { goal: 'チームの目標は引き続き編集できる' })
    console.log(
      'PASS: 種類の逆転・実績・未分類・存在しない称号の保存拒否、任意の正しい組、作成者のみ変更',
    )

    // 種類チェックは称号変更時だけに行い、既存チームの無関係な編集は止めない。
    const legacy = db.collection('teams').doc()
    await legacy.set({
      ...data,
      selfDisTitleId: 'hostage-victim',
      teamDisTitleId: 'deadline-breaker',
    })
    await updateDoc(doc(owner.db, legacy.path), { name: '既存チームの編集' })
    await updateDoc(doc(owner.db, legacy.path), {
      selfDisTitleId: 'deadline-breaker',
      teamDisTitleId: 'hostage-victim',
    })

    await updateDoc(ownerRef, {
      selfDisTitleId: 'deadline-breaker',
      teamDisTitleId: 'deadline-refugee',
    })
    const taskRef = teamRef.collection('tasks').doc('overdue')
    const now = Timestamp.now()
    await taskRef.set({ title: '期限切れ', ownerId: owner.uid, dueAt: now, status: 'todo' })
    await processOverdueTask(db, taskRef, now)
    await processOverdueTask(db, taskRef, now)
    assert.equal((await taskRef.get()).get('status'), 'overdue')
    assert.deepEqual((await db.doc(`users/${owner.uid}`).get()).get('titleIds'), [
      'deadline-breaker',
    ])
    assert.deepEqual((await db.doc(`users/${member.uid}`).get()).get('titleIds'), [
      'deadline-refugee',
    ])
    await teamRef
      .collection('tasks')
      .doc('done')
      .set({ title: '完了', ownerId: owner.uid, dueAt: now, status: 'done' })
    await grantAchievementTitles(db, owner.uid)
    assert.deepEqual((await db.doc(`users/${owner.uid}`).get()).get('titleIds'), [
      'deadline-breaker',
      'achievement-1',
    ])
    console.log(
      'PASS: seedの種類・おすすめ参照、既存チームの編集、本人・仲間への付与、二重付与防止、実績の付与',
    )
  } finally {
    await Promise.all(apps.map(deleteApp))
    await deleteAdmin(admin)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
