import type { ReactionType } from '@hitojichi/shared'

/** リアクションの表示（絵文字と読み上げ用の名前）。並び順はツールバーの表示順 */
export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'cheer', emoji: '🔥', label: 'がんばれ' },
  { type: 'great', emoji: '👏', label: 'すごい' },
  { type: 'doubt', emoji: '👀', label: 'ほんとに？' },
  { type: 'hurry', emoji: '⏰', label: 'いそげ' },
]

export function reactionOf(type: ReactionType) {
  return REACTIONS.find((reaction) => reaction.type === type)!
}
