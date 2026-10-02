/**
 * フロントエンドとCloud Functionsで共通の型・入力検証。
 * 変更するときは、先にチーム全員に声をかけること（フロントとFunctionsの両方に影響する）。
 */
import { z } from 'zod'

// 参加処理の上限と画面の募集表示を同じ人数に揃える。
export const MAX_TEAM_MEMBERS = 5

/** users/{uid} */
export const userSchema = z.object({
  displayName: z.string().min(1).max(30),
  bio: z.string().max(120).optional(), // 自己紹介。未登録の既存ユーザーも有効
  photoURL: z.string().url().nullable(),
  titleIds: z.array(z.string()), // 獲得した称号（Functionsのみ書き込み可）
  equippedTitleId: z.string().min(1).nullable().optional(), // 装備中の称号マスタID。既存ユーザーは未設定
})
export type User = z.infer<typeof userSchema>

/** teams/{teamId} */
export const teamSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().max(120).optional(), // 説明なしの既存チームも有効
  // 既存チームの読み込みを保ち、新規作成時の必須化はcreateTeamInputで行う。
  goal: z.string().trim().min(1).max(120).optional(),
  // 日付のみの期限なので、タイムゾーンで日付がずれるTimestampへ変換しない。
  goalDueDate: z.iso.date().optional(),
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
  completedLate: z.boolean().optional(), // 完了時の期限超過。未完了に戻すとfalse。既存タスクは未設定
  completedAfterOverdue: z.boolean().optional(), // 旧データの表示互換用。新規書き込みには使わない
})
export type Task = z.infer<typeof taskSchema>

/**
 * teams/{teamId}/tasks/{taskId}/proofs/{proofId}（タスクをやった証明。ファイル本体はStorageの同じパスに置く）
 * 上限・種類は storage.rules / firestore.rules と揃えること。
 */
export const MAX_PROOF_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_PROOF_NOTE_LENGTH = 100
export function isAllowedProofContentType(contentType: string) {
  return /^image\/.+$/.test(contentType) || contentType === 'application/pdf'
}
export const proofSchema = z.object({
  uploaderId: z.string().min(1), // タスクの持ち主本人
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(200),
  contentType: z.string().refine(isAllowedProofContentType),
  size: z.number().int().positive().max(MAX_PROOF_FILE_SIZE),
  note: z.string().max(MAX_PROOF_NOTE_LENGTH).optional(), // ひとこと（任意）
  createdAt: z.date(),
})
export type Proof = z.infer<typeof proofSchema>

/** titles/{titleId}（称号マスタ） */
export const titleKindSchema = z.enum(['achievement', 'self', 'team'])
export const titleSchema = z.object({
  name: z.string(),
  description: z.string(),
  // 未分類の称号を本人・仲間の両方に使わないため、マスタ投入時に種類を必須にする。
  kind: titleKindSchema,
  recommendedTeamTitleIds: z.array(z.string().min(1)).optional(), // 本人用のみ：相性のよい仲間用称号のID
  requiredDoneCount: z.number().int().positive().optional(), // 実績のみ：獲得に必要な完了タスク数
})
export type Title = z.infer<typeof titleSchema>

/** 実績の称号か（本人用・仲間用のdis称号を除く） */
export function isAchievementTitle(title: Pick<Title, 'kind'>) {
  return title.kind === 'achievement'
}

/** フォーム入力用 */
export const updateUserProfileInput = userSchema.pick({ displayName: true, bio: true })
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInput>
export const updateEquippedTitleInput = z.object({
  equippedTitleId: z.string().min(1).nullable(), // nullで装備を外す
})
export type UpdateEquippedTitleInput = z.infer<typeof updateEquippedTitleInput>
export const createTeamInput = teamSchema
  .pick({ name: true, goal: true, goalDueDate: true, selfDisTitleId: true, teamDisTitleId: true })
  .required({ goal: true, goalDueDate: true })
export type CreateTeamInput = z.infer<typeof createTeamInput>
export const updateTeamHostageInput = teamSchema.pick({
  selfDisTitleId: true,
  teamDisTitleId: true,
})
export type UpdateTeamHostageInput = z.infer<typeof updateTeamHostageInput>
export const createTaskInput = taskSchema.pick({ title: true, dueAt: true })
export type CreateTaskInput = z.infer<typeof createTaskInput>
export const updateTaskInput = taskSchema.pick({ title: true, dueAt: true })
export type UpdateTaskInput = z.infer<typeof updateTaskInput>
export const createProofInput = z.object({
  note: z.string().trim().max(MAX_PROOF_NOTE_LENGTH).optional(),
})
export type CreateProofInput = z.infer<typeof createProofInput>
export const joinTeamInput = z.object({ inviteCode: z.string().trim().min(1).max(128) })
export type JoinTeamInput = z.infer<typeof joinTeamInput>
export type JoinTeamResult = { teamId: string; teamName: string } // 参加後の画面でチーム名を表示する
