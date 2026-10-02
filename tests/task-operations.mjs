// Firestore Emulatorを起動して実行:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 node tests/task-operations.mjs
// 本番には接続しない。専用demoプロジェクト内に検証データを作成する。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeApp as initializeAdminApp,
  deleteApp as deleteAdminApp,
} from 'firebase-admin/app'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  terminate,
  updateDoc,
} from 'firebase/firestore'
import { computed, createRenderer, createSSRApp, nextTick, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import { createJiti } from 'jiti'

const host = process.env.FIRESTORE_EMULATOR_HOST
assert.match(
  host ?? '',
  /^127\.0\.0\.1:\d+$/,
  'ローカルFirestore Emulatorの接続先を指定してください',
)
const projectId = 'demo-task-operations'
const adminApp = initializeAdminApp({ projectId })
const admin = getAdminFirestore(adminApp)
const app = initializeApp({ projectId, apiKey: 'demo' })
const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', Number(host.split(':')[1]), {
  mockUserToken: { sub: 'owner', user_id: 'owner' },
})
const teamId = `operations-${Date.now()}`
const taskRef = doc(db, `teams/${teamId}/tasks/task`)
const adminRef = admin.doc(taskRef.path)
const future = new Date(Date.now() + 3600000)
const past = new Date(Date.now() - 3600000)
const original = { title: 'test task', dueAt: future, status: 'todo', ownerId: 'owner' }
const team = ref({ name: 'test team', memberIds: ['owner'], createdBy: 'owner' })
const tasks = ref([])
for (const value of [team, tasks]) {
  value.pending = ref(false)
  value.error = ref(null)
}
const currentUser = ref({ uid: 'owner' })
// VueFireの購読・認証だけ差し替え、composableの保存・トランザクションは実物を実行する。
globalThis.__taskTest = { db, team, tasks, currentUser }
const dataModule = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
async function importTs(source, aliases) {
  const js = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(
      /from (['"])([^'"]+)\1/g,
      (_, quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`,
    )
  return import(dataModule(js))
}
const jiti = createJiti(import.meta.url)
const { processOverdueTask } = await jiti.import('../functions/src/overdueTasks.ts')
const shared = await readFile(new URL('../shared/schemas.ts', import.meta.url), 'utf8')
const sharedJs = ts.transpileModule(shared, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText
const sharedUrl = dataModule(
  sharedJs.replace("from 'zod'", `from ${JSON.stringify(import.meta.resolve('zod'))}`),
)
const aliases = {
  '@hitojichi/shared': sharedUrl,
  '@/lib/firebase': dataModule('export const db = globalThis.__taskTest.db'),
  // 証明はStorageを使うので、タスク操作の検証では何もしない版に差し替える
  '@/composables/useTaskProofs': dataModule('export const deleteAllTaskProofs = async () => {}'),
  vuefire: dataModule(`
    export const useCurrentUser = () => globalThis.__taskTest.currentUser;
    export const useDocument = () => globalThis.__taskTest.team;
    export const useCollection = () => globalThis.__taskTest.tasks;
  `),
}
const { useTeamTasks } = await importTs(
  await readFile(new URL('../web/src/composables/useTeamTasks.ts', import.meta.url), 'utf8'),
  aliases,
)
const operations = useTeamTasks(teamId)
let passed = 0
async function check(name, action) {
  await action()
  passed++
  console.log(`PASS ${name}`)
}
const denied = (action) => assert.rejects(action, (error) => error.code === 'permission-denied')
const data = async () => (await adminRef.get()).data()
const reset = (changes = {}) => adminRef.set({ ...original, ...changes })

try {
  await admin.doc(`teams/${teamId}`).set({
    ...team.value,
    memberIds: ['owner', 'other'],
    inviteCode: 'test',
    selfDisTitleId: 'self',
    teamDisTitleId: 'team',
  })
  await admin.doc('users/owner').set({ titleIds: [] })
  await admin.doc('users/other').set({ titleIds: [] })
  await check('期限内 todo -> done はfalse', async () => {
    await reset()
    await operations.setTaskStatus('task', 'done')
    assert.equal((await data()).completedLate, false)
    assert.equal((await data()).status, 'done')
  })
  await check('期限超過 todo -> done はtrue（Scheduler未実行）', async () => {
    await reset({ dueAt: past })
    await operations.setTaskStatus('task', 'done')
    assert.equal((await data()).completedLate, true)
  })
  await check('overdue -> done は期限延長後でもtrue', async () => {
    await reset({ status: 'overdue' })
    await operations.setTaskStatus('task', 'done')
    assert.equal((await data()).completedLate, true)
  })
  await check('done -> todo はfalseに戻る', async () => {
    await operations.setTaskStatus('task', 'todo')
    assert.equal((await data()).status, 'todo')
    assert.equal((await data()).completedLate, false)
  })
  await check('期限内に再完了するとfalse', async () => {
    await operations.setTaskStatus('task', 'done')
    assert.equal((await data()).completedLate, false)
  })
  await check('旧履歴付きdoneから戻して再完了', async () => {
    await reset({ status: 'done', completedAfterOverdue: true })
    await operations.setTaskStatus('task', 'todo')
    assert.equal((await data()).completedLate, false)
    await operations.setTaskStatus('task', 'done')
    assert.equal((await data()).completedLate, false)
  })
  await check('新規作成はcompletedLate=false', async () => {
    await operations.createTask({ title: 'new', dueAt: future })
    const result = await admin.collection(`teams/${teamId}/tasks`).where('title', '==', 'new').get()
    assert.equal(result.docs[0].data().completedLate, false)
  })
  await check('保存処理が過去日時を拒否', () =>
    assert.rejects(() => operations.createTask({ title: 'past', dueAt: past })),
  )
  await check('Rulesが過去日時の新規作成を拒否', async () => {
    const { setDoc } = await import('firebase/firestore')
    await denied(() => setDoc(doc(db, `teams/${teamId}/tasks/past`), { ...original, dueAt: past }))
  })
  for (const [name, changes, write] of [
    ['期限超過を通常完了に偽装', { dueAt: past }, { status: 'done', completedLate: false }],
    ['期限内を期限切れ完了に偽装', {}, { status: 'done', completedLate: true }],
    ['完了フラグ省略', {}, { status: 'done' }],
    ['done -> overdue', { status: 'done', completedLate: false }, { status: 'overdue' }],
    ['todo -> overdue', {}, { status: 'overdue' }],
    ['overdue -> todo', { status: 'overdue' }, { status: 'todo', completedLate: false }],
    ['フラグ単独書き換え', { status: 'done', completedLate: true }, { completedLate: false }],
    ['復帰時のtrue残留', { status: 'done', completedLate: true }, { status: 'todo' }],
    [
      '期限と完了状態の同時改変',
      { dueAt: past },
      { status: 'done', dueAt: future, completedLate: false },
    ],
  ]) {
    await check(`Rules拒否: ${name}`, async () => {
      await reset(changes)
      await denied(() => updateDoc(taskRef, write))
    })
  }
  for (const status of ['todo', 'done', 'overdue']) {
    await check(`他人の${status}の状態変更をcomposableとRulesが拒否`, async () => {
      await reset({ ownerId: 'other', status })
      const next = status === 'done' ? 'todo' : 'done'
      await assert.rejects(() => operations.setTaskStatus('task', next), /自分のタスク/)
      await denied(() => updateDoc(taskRef, { status: next, completedLate: status === 'overdue' }))
    })
  }
  await check('編集は期限切れ完了の状態を保持', async () => {
    await reset({ status: 'done', completedLate: true })
    await operations.updateTask('task', { title: 'edited', dueAt: past })
    assert.equal((await data()).title, 'edited')
    assert.equal((await data()).status, 'done')
    assert.equal((await data()).completedLate, true)
  })
  await check('既存Functionsの称号付与と完了・復帰後の保持', async () => {
    await reset({ dueAt: past })
    await processOverdueTask(admin, adminRef, Timestamp.now())
    assert.equal((await data()).status, 'overdue')
    await operations.setTaskStatus('task', 'done')
    await processOverdueTask(admin, adminRef, Timestamp.now())
    assert.equal((await data()).status, 'done')
    await operations.setTaskStatus('task', 'todo')
    assert.deepEqual((await admin.doc('users/owner').get()).data().titleIds, ['self'])
    assert.deepEqual((await admin.doc('users/other').get()).data().titleIds, ['team'])
  })
  await check('本人の削除', async () => {
    await operations.deleteTask('task')
    assert.equal((await adminRef.get()).exists, false)
  })

  // 実際のSFCをコンパイルして表示ラベルを検証。ブラウザのレイアウト確認とは別。
  globalThis.__taskTest.operations = {
    ...operations,
    team,
    tasks,
    teamProgress: computed(() => 0),
    isCreator: computed(() => false),
  }
  const { descriptor } = parse(
    await readFile(new URL('../web/src/views/TeamTasksView.vue', import.meta.url), 'utf8'),
  )
  const script = compileScript(descriptor, { id: 'task-view-test', inlineTemplate: true })
  const { default: View } = await importTs(script.content, {
    ...aliases,
    // DOM専用のv-modelディレクティブを検証ホスト向けにする。
    vue: dataModule(
      `export * from ${JSON.stringify(import.meta.resolve('vue'))}; export const vModelText = {mounted(node, binding) {node.props.value = binding.value}, beforeUpdate(node, binding) {node.props.value = binding.value}}`,
    ),
    '@/composables/useTeamTasks': dataModule(
      'export const useTeamTasks = () => globalThis.__taskTest.operations',
    ),
    '@/composables/useTeamMembers': dataModule(
      `import { ref } from ${JSON.stringify(import.meta.resolve('vue'))}; export const useTeamMembers = () => ref([{id:'owner', displayName:'Owner'}])`,
    ),
    '@/composables/useTitles': dataModule(
      `import { ref } from ${JSON.stringify(import.meta.resolve('vue'))}; export const useTitles = () => ({titles: ref([])})`,
    ),
    '@/components/HostageTitleFields.vue': dataModule('export default {render: () => null}'),
    '@/components/TaskProofs.vue': dataModule('export default {render: () => null}'),
    'vue-router': dataModule(
      `import { h } from ${JSON.stringify(import.meta.resolve('vue'))}; export const RouterLink = {render() {return h('a', this.$slots.default())}}`,
    ),
  })
  for (const [name, fields, label] of [
    ['未着手', { status: 'todo' }, '未着手'],
    ['Scheduler前の期限超過', { status: 'todo', dueAt: past }, '期限切れ'],
    [
      'Timestampの期限超過',
      { status: 'todo', dueAt: (await import('firebase/firestore')).Timestamp.fromDate(past) },
      '期限切れ',
    ],
    ['期限切れ', { status: 'overdue' }, '期限切れ'],
    ['通常完了', { completedLate: false }, '完了'],
    ['期限内完了は期限経過後も通常完了', { completedLate: false, dueAt: past }, '完了'],
    ['期限切れ完了', { completedLate: true }, '期限切れ完了'],
    ['旧データ', { completedAfterOverdue: true }, '期限切れ完了'],
    ['新フラグを優先', { completedLate: false, completedAfterOverdue: true }, '完了'],
  ]) {
    await check(`SFC表示: ${name}`, async () => {
      tasks.value = [{ ...original, id: 'task', status: 'done', ...fields }]
      const html = await renderToString(createSSRApp(View, { teamId }))
      assert.match(html, new RegExp(`>\\s*${label}\\s*</span>`))
      const late = label === '期限切れ' || label === '期限切れ完了'
      assert.equal(html.includes('bg-late text-on-late'), late)
      assert.equal(/<li class="[^"]*\bis-late\b/.test(html), late)
      const done = tasks.value[0].status === 'done'
      assert.equal(/<li class="[^"]*\bis-done\b/.test(html), done)
      assert.match(
        html,
        new RegExp(`class="task-status-action"[^>]*>.*${done ? '未完了に戻す' : '完了'}`, 's'),
      )
      assert.match(html, /aria-label="編集"/)
      assert.match(html, /aria-label="削除"/)
      assert.match(
        html,
        /class="task-header-actions"[^>]*>.*aria-label="編集".*aria-label="削除".*class="task-due/s,
      )
      assert.ok(html.indexOf('aria-label="編集"') < html.indexOf('task-status-action'))
      assert.ok(html.indexOf('aria-label="削除"') < html.indexOf('task-status-action'))
    })
  }
  await check('全状態で編集中は状態ボタンを隠し、保存・キャンセル後に再表示', async () => {
    // ブラウザなしのVueホスト。イベントとリアクティブ更新を実行する。
    const element = (type, text = '') => ({ type, text, children: [], props: {}, parent: null })
    const renderer = createRenderer({
      createElement: (type) => element(type),
      createText: (text) => element('#text', text),
      createComment: (text) => element('#comment', text),
      setText: (node, text) => {
        node.text = text
      },
      setElementText: (node, text) => {
        node.text = text
        node.children = []
      },
      patchProp: (node, key, previous, next) => {
        node.props[key] = next
      },
      insert(node, parent, anchor = null) {
        if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
        const index = anchor ? parent.children.indexOf(anchor) : -1
        parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
        node.parent = parent
      },
      remove(node) {
        node.parent.children.splice(node.parent.children.indexOf(node), 1)
      },
      parentNode: (node) => node.parent,
      nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    })
    const root = element('root')
    const descendants = (node) => [node, ...node.children.flatMap(descendants)]
    const textOf = (node) => node.text + node.children.map(textOf).join('')
    const button = (text) =>
      descendants(root).find(
        (node) =>
          node.type === 'button' && (node.props['aria-label'] ?? textOf(node).trim()) === text,
      )
    const sync = async () => {
      tasks.value = [{ ...(await data()), dueAt: (await data()).dueAt.toDate(), id: 'task' }]
      await nextTick()
    }
    await reset({ dueAt: past })
    await sync()
    const mounted = renderer.createApp(View, { teamId })
    mounted.mount(root)
    try {
      await check('操作なしで時刻更新により期限切れ表示（保存状態はtodoのまま）', async () => {
        const clock = Date.now
        const time = clock()
        tasks.value = [{ ...original, id: 'task', dueAt: new Date(time + 60000) }]
        await nextTick()
        const card = () => descendants(root).find((node) => node.type === 'li')
        assert.ok(!card().props.class.includes('is-late'))
        try {
          Date.now = () => time + 120000
          await new Promise((resolve) => setTimeout(resolve, 1100))
          await nextTick()
          assert.ok(card().props.class.includes('is-late'))
          assert.ok(textOf(card()).includes('期限切れ'))
          assert.equal(tasks.value[0].status, 'todo')
          assert.equal((await data()).status, 'todo')
          assert.equal((await data()).completedLate, undefined)
        } finally {
          Date.now = clock
        }
      })
      for (const status of ['todo', 'done', 'overdue']) {
        await reset({ status, dueAt: past })
        await sync()
        const label = status === 'done' ? '未完了に戻す' : '完了'
        for (const finish of ['キャンセル', '保存']) {
          assert.ok(button(label))
          button('編集').props.onClick()
          await nextTick()
          assert.equal(button('完了'), undefined)
          assert.equal(button('未完了に戻す'), undefined)
          assert.ok(button('保存'))
          assert.ok(button('キャンセル'))
          const inputs = descendants(root).filter((node) => node.type === 'input')
          inputs[0].props['onUpdate:modelValue']('入力中のタスク名')
          await nextTick()
          if (finish === '保存') {
            const form = descendants(root).find((node) => node.type === 'form')
            await form.props.onSubmit({ preventDefault() {} })
            await sync()
            assert.equal((await data()).title, '入力中のタスク名')
            assert.equal((await data()).status, status)
          } else {
            button('キャンセル').props.onClick()
            await nextTick()
          }
          assert.ok(button('編集'))
          assert.ok(button('削除'))
          assert.equal(button('編集').parent.props.class, 'task-header-actions')
          assert.equal(button('削除').parent, button('編集').parent)
          assert.equal(button(label).parent.props.class, 'task-actions')
          assert.equal(button(label).parent.children.at(-1), button(label))
        }
      }
    } finally {
      mounted.unmount()
    }
  })
  console.log(`${passed} checks passed`)
} finally {
  await admin.recursiveDelete(admin.doc(`teams/${teamId}`))
  await terminate(db)
  await deleteApp(app)
  await admin.terminate()
  await deleteAdminApp(adminApp)
  delete globalThis.__taskTest
}
