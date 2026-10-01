<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Check, ChevronRight, Shield, Skull, Trophy, X } from 'lucide-vue-next'
import { useTitles } from '@/composables/useTitles'
import IconTile from '@/components/IconTile.vue'

const selfDisTitleId = defineModel<string>('selfDisTitleId', { required: true })
const teamDisTitleId = defineModel<string>('teamDisTitleId', { required: true })
const { titles: allTitles } = useTitles()
// 未分類の旧マスタも候補に混ぜず、付与される側が明確な称号だけを選ぶ。
const selfTitles = computed(() => allTitles.value.filter((title) => title.kind === 'self'))
const teamTitles = computed(() => allTitles.value.filter((title) => title.kind === 'team'))
const selectedSelfTitle = computed(() =>
  selfTitles.value.find((title) => title.id === selfDisTitleId.value),
)
const recommendedIds = computed(() => selectedSelfTitle.value?.recommendedTeamTitleIds ?? [])
const dialog = ref<HTMLDialogElement | null>(null)
const dialogHeadingId = useId()
const activeField = ref<'self' | 'team'>('self')
// dis称号を選び直してもカードの位置を変えず、おすすめはバッジだけで示す。
const titles = computed(() => (activeField.value === 'self' ? selfTitles.value : teamTitles.value))
const selectedId = computed(() =>
  activeField.value === 'self' ? selfDisTitleId.value : teamDisTitleId.value,
)
const isPending = computed(() => allTitles.pending.value)
const loadError = computed(() => allTitles.error.value)
const fields = computed(() => [
  {
    key: 'self' as const,
    label: 'dis称号',
    recipient: 'サボった本人に付く',
    icon: Skull,
    title: selectedSelfTitle.value,
  },
  {
    key: 'team' as const,
    label: 'team dis称号',
    recipient: 'サボった人の仲間に付く',
    icon: Shield,
    title: teamTitles.value.find((title) => title.id === teamDisTitleId.value),
  },
])

function openPicker(field: 'self' | 'team') {
  activeField.value = field
  // ネイティブのモーダルにフォーカス管理とEscapeでの閉じる操作を任せる。
  dialog.value?.showModal()
}

function selectTitle(id: string) {
  // 各称号を独立して選べるよう、選んだ項目だけを確定してモーダルを閉じる。
  if (activeField.value === 'self') selfDisTitleId.value = id
  else teamDisTitleId.value = id
  dialog.value?.close()
}
</script>

<template>
  <button
    v-for="field in fields"
    :key="field.key"
    type="button"
    aria-haspopup="dialog"
    :aria-label="`${field.label}を選択、現在：${field.title?.name ?? '未選択'}`"
    class="group w-full rounded-2xl border-[3px] border-ink bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    @click="openPicker(field.key)"
  >
    <span class="flex items-center gap-3">
      <!-- 見出しと同じ部品を使い、称号の種類が違っても縁取りと影を統一する。 -->
      <IconTile :icon="field.icon" :tone="field.key === 'self' ? 'primary' : 'accent'" />
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-extrabold">{{ field.label }}</span>
        <span class="mt-0.5 block text-xs text-ink/60">{{ field.recipient }}</span>
      </span>
      <span
        class="rounded-full px-2 py-1 text-xs font-bold"
        :class="field.title ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-ink/60'"
      >
        {{ field.title ? '選択済み' : '未選択' }}
      </span>
    </span>
    <span class="mt-4 flex items-center justify-between gap-3">
      <span class="min-w-0 font-display text-base break-all">
        {{ field.title?.name ?? '称号を選ぶ' }}
      </span>
      <ChevronRight
        :size="20"
        class="shrink-0 text-primary transition group-hover:translate-x-1"
        aria-hidden="true"
      />
    </span>
    <span v-if="field.title?.description" class="mt-2 block text-xs leading-relaxed text-ink/70">
      {{ field.title.description }}
    </span>
  </button>

  <Teleport to="body">
    <dialog
      ref="dialog"
      :aria-labelledby="dialogHeadingId"
      class="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border-[3px] border-ink bg-canvas p-0 text-ink shadow backdrop:bg-ink/60"
      @click.self="dialog?.close()"
    >
      <div class="p-5 sm:p-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-dot text-xs tracking-widest text-primary">SELECT TITLE</p>
            <h3 :id="dialogHeadingId" class="mt-2 font-display text-xl">
              {{ activeField === 'self' ? 'dis称号' : 'team dis称号' }}を選択
            </h3>
          </div>
          <button
            type="button"
            aria-label="称号選択を閉じる"
            class="grid size-10 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-white transition hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"
            @click="dialog?.close()"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </div>
        <p class="mt-3 text-sm text-ink/70">
          {{
            activeField === 'self'
              ? 'サボった本人に付く称号を選んでください。'
              : '巻き添えになった仲間に付く称号を選んでください。'
          }}
        </p>
        <p
          v-if="activeField === 'team' && selectedSelfTitle"
          class="mt-2 text-sm font-bold text-primary"
        >
          「{{ selectedSelfTitle.name }}」と組み合わせるteam dis称号
        </p>
        <p v-if="isPending" role="status" class="mt-5 text-sm text-ink/60">読み込み中…</p>
        <p v-else-if="loadError" role="alert" class="mt-5 text-sm font-bold text-red-600">
          称号の取得に失敗しました。
        </p>
        <p v-else-if="titles.length === 0" class="mt-5 text-sm text-ink/60">
          選べる称号はまだありません。
        </p>
        <div v-else class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            v-for="title in titles"
            :key="title.id"
            type="button"
            :aria-pressed="selectedId === title.id"
            class="rounded-2xl border-[3px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="
              selectedId === title.id ? 'border-primary bg-primary/10' : 'border-ink bg-white'
            "
            @click="selectTitle(title.id)"
          >
            <span class="flex items-center justify-between gap-2">
              <IconTile :icon="Trophy" tone="muted" />
              <span
                v-if="activeField === 'team' && recommendedIds.includes(title.id)"
                class="rounded-full bg-accent px-2 py-1 text-xs font-bold text-ink"
              >
                おすすめ
              </span>
              <span
                v-if="selectedId === title.id"
                class="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-bold text-white"
              >
                <Check :size="13" aria-hidden="true" />選択中
              </span>
            </span>
            <span class="mt-3 block font-extrabold break-all">{{ title.name }}</span>
            <span class="mt-2 block text-xs leading-relaxed text-ink/70">{{
              title.description
            }}</span>
          </button>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>
