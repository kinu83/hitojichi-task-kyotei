import { httpsCallable } from 'firebase/functions'
import type {
  JoinTeamInput,
  JoinTeamOutput,
  JudgeOverdueTasksInput,
  JudgeOverdueTasksOutput,
} from '@hitojichi/shared'
import { functions } from '@/lib/firebase'

/**
 * Cloud Functions（onCall）の呼び出しをまとめたもの。
 * 失敗時は FirebaseError が投げられ、error.code が 'functions/not-found' などになる。
 */
export async function joinTeam(input: JoinTeamInput) {
  const call = httpsCallable<JoinTeamInput, JoinTeamOutput>(functions, 'joinTeam')
  return (await call(input)).data
}

export async function judgeOverdueTasks(input: JudgeOverdueTasksInput) {
  const call = httpsCallable<JudgeOverdueTasksInput, JudgeOverdueTasksOutput>(
    functions,
    'judgeOverdueTasks',
  )
  return (await call(input)).data
}
