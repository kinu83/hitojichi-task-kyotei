/**
 * フロントエンドとCloud Functionsで共通の型・入力検証。
 * 変更するときは、先にチーム全員に声をかけること（フロントとFunctionsの両方に影響する）。
 */
import { z } from 'zod'

/** users/{uid} */
export const userSchema = z.object({
  displayName: z.string().min(1).max(30),
  photoURL: z.string().url().nullable(),
  titleIds: z.array(z.string()), // 獲得した称号（Functionsのみ書き込み可）
})
export type User = z.infer<typeof userSchema>

/** teams/{teamId} */
export const teamSchema = z.object({
  name: z.string().min(1).max(40),
  memberIds: z.array(z.string()).min(1),
  inviteCode: z.string(),
  createdBy: z.string(),
  // 人質：チーム作成時に作成者が選ぶ称号の組（変更も作成者のみ）
  selfDisTitleId: z.string().min(1), // サボった本人に付与するdis称号
  teamDisTitleId: z.string().min(1), // サボった人の仲間に付与するteam dis称号
})
export type Team = z.infer<typeof teamSchema>

/** teams/{teamId}/tasks/{taskId}（各メンバーが自分で追加・管理する個人タスク） */
export const taskStatusSchema = z.enum(['todo', 'done', 'overdue'])
export const taskSchema = z.object({
  title: z.string().min(1).max(100),
  ownerId: z.string().min(1), // タスクを追加した本人
  dueAt: z.date(),
  status: taskStatusSchema,
})
export type Task = z.infer<typeof taskSchema>

/** titles/{titleId}（称号マスタ） */
export const titleSchema = z.object({
  name: z.string(),
  description: z.string(),
  shameLevel: z.number().int().min(0).max(5), // 不名誉度 TODO(key): 使うかどうか・格上げの決め方を決める
})
export type Title = z.infer<typeof titleSchema>

/** フォーム入力用 */
export const updateUserProfileInput = userSchema.pick({ displayName: true })
export const createTeamInput = teamSchema.pick({
  name: true,
  selfDisTitleId: true,
  teamDisTitleId: true,
})
export type CreateTeamInput = z.infer<typeof createTeamInput>
export const updateTeamHostageInput = teamSchema.pick({
  selfDisTitleId: true,
  teamDisTitleId: true,
})
export type UpdateTeamHostageInput = z.infer<typeof updateTeamHostageInput>
export const createTaskInput = taskSchema.pick({ title: true, dueAt: true })
export type CreateTaskInput = z.infer<typeof createTaskInput>

/** teams/{teamId}/titleEvents/{eventId}（称号付与の記録。書き込みはFunctionsのみ） */
export const titleEventKindSchema = z.enum(['self', 'team']) // self: dis称号 / team: team dis称号
export const titleEventSchema = z.object({
  uid: z.string(), // 称号を付与された人
  titleId: z.string(),
  previousTitleId: z.string().nullable(), // 格上げ前の称号（初回はチームの人質の称号なので null）
  kind: titleEventKindSchema,
  causedBy: z.string(), // サボった本人のuid（kind: 'self' なら uid と同じ）
  taskId: z.string(), // 期限切れになったタスク
  createdAt: z.date(),
})
export type TitleEvent = z.infer<typeof titleEventSchema>

/** Functions（onCall）の入出力。フロントとFunctionsでこの形を守る */
export const joinTeamInput = z.object({
  inviteCode: z.string().trim().toUpperCase().length(6),
})
export type JoinTeamInput = z.infer<typeof joinTeamInput>
export type JoinTeamOutput = { teamId: string; teamName: string } // 参加後の画面でチーム名を表示する

export const judgeOverdueTasksInput = z.object({ teamId: z.string().min(1) })
export type JudgeOverdueTasksInput = z.infer<typeof judgeOverdueTasksInput>
export type JudgeOverdueTasksOutput = {
  overdueTaskIds: string[] // 今回の判定で overdue にしたタスク
  awarded: Omit<TitleEvent, 'createdAt'>[] // 今回付与した称号
}
