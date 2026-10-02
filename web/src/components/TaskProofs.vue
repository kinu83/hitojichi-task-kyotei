<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { Camera, FileText, Paperclip, Trash2, Upload } from 'lucide-vue-next'
import { MAX_PROOF_NOTE_LENGTH, type Proof } from '@hitojichi/shared'
import { useTaskProofs } from '@/composables/useTaskProofs'
import BaseButton from '@/components/BaseButton.vue'
import BaseDialog from '@/components/BaseDialog.vue'

// タスクをやった証明（写真・PDF）。仲間は閲覧のみ、タスクの持ち主だけが追加・削除できる
const props = defineProps<{
  teamId: string
  taskId: string
  taskTitle: string
  isOwner: boolean
}>()

const { proofs, downloadUrls, uploadProgress, uploadProof, deleteProof } = useTaskProofs(
  () => props.teamId,
  () => props.taskId,
)
const open = ref(false)
const selectedFile = ref<File | null>(null)
const note = ref('')
const errorMessage = ref('')
const busyProofId = ref<string | null>(null)
const isUploading = computed(() => uploadProgress.value !== null)
const noteId = useId()

// 開き直したときに前回の入力・エラーを残さない
watch(open, (value) => {
  if (!value) return
  selectedFile.value = null
  note.value = ''
  errorMessage.value = ''
})

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  errorMessage.value = ''
  input.value = '' // 同じファイルを選び直せるようにする
}

async function submit() {
  if (!selectedFile.value || isUploading.value) return
  errorMessage.value = ''
  try {
    await uploadProof(selectedFile.value, { note: note.value || undefined })
    selectedFile.value = null
    note.value = ''
  } catch (error) {
    console.error(error)
    errorMessage.value =
      error instanceof Error && !('code' in error)
        ? error.message
        : '証明を追加できませんでした。もう一度お試しください。'
  }
}

async function remove(proof: Proof & { id: string }) {
  if (busyProofId.value || !window.confirm(`「${proof.fileName}」を削除しますか？`)) return
  errorMessage.value = ''
  busyProofId.value = proof.id
  try {
    await deleteProof(proof)
  } catch (error) {
    console.error(error)
    errorMessage.value = '証明を削除できませんでした。もう一度お試しください。'
  } finally {
    busyProofId.value = null
  }
}

function formatDate(date: Proof['createdAt'] | { toDate(): Date } | null) {
  if (!date) return ''
  return (date instanceof Date ? date : date.toDate()).toLocaleString('ja-JP')
}
</script>

<template>
  <div>
    <!-- 仲間のタスクで証明がまだ無いときは何も出さない -->
    <button
      v-if="isOwner || proofs.length"
      type="button"
      class="proof-button"
      :class="{ 'has-proof': proofs.length }"
      @click="open = true"
    >
      <Camera :size="15" aria-hidden="true" />
      <template v-if="proofs.length">証明 {{ proofs.length }}</template>
      <template v-else>証明を追加</template>
    </button>

    <BaseDialog v-model:open="open" eyebrow="PROOF" :title="`「${taskTitle}」の証明`">
      <p class="mt-3 text-sm text-ink/70">
        {{
          isOwner
            ? '写真やPDFで、本当にやったことを仲間に見せよう。'
            : '仲間がアップした、タスクをやった証明です。'
        }}
      </p>

      <form v-if="isOwner" class="upload-panel" @submit.prevent="submit">
        <div class="flex flex-wrap gap-2">
          <!-- capture付きはスマホでカメラが直接起動する。PCでは通常のファイル選択になる -->
          <label class="pick-button">
            <Camera :size="16" aria-hidden="true" />写真を撮る
            <input
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              :disabled="isUploading"
              @change="onFileChange"
            />
          </label>
          <label class="pick-button">
            <Paperclip :size="16" aria-hidden="true" />ファイルを選ぶ
            <input
              type="file"
              accept="image/*,application/pdf"
              class="sr-only"
              :disabled="isUploading"
              @change="onFileChange"
            />
          </label>
        </div>
        <template v-if="selectedFile">
          <p class="text-sm font-bold break-all">選択中：{{ selectedFile.name }}</p>
          <label :for="noteId" class="text-sm">ひとこと（任意）</label>
          <input
            :id="noteId"
            v-model="note"
            type="text"
            :maxlength="MAX_PROOF_NOTE_LENGTH"
            placeholder="例：3章まで書き終えた！"
            class="w-full rounded-xl border-2 border-muted bg-white px-3 py-2 outline-none focus:border-primary"
            :disabled="isUploading"
          />
          <div
            v-if="isUploading"
            class="h-3 overflow-hidden rounded-full border border-ink bg-white"
            role="progressbar"
            aria-label="アップロードの進み具合"
            :aria-valuenow="uploadProgress ?? 0"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full bg-primary transition-all"
              :style="{ width: uploadProgress + '%' }"
            />
          </div>
          <BaseButton type="submit" size="sm" :disabled="isUploading">
            <Upload :size="16" aria-hidden="true" />
            {{ isUploading ? `アップロード中… ${uploadProgress}%` : 'アップロード' }}
          </BaseButton>
        </template>
        <p class="text-xs text-ink/60">写真またはPDF、10MBまで</p>
      </form>

      <p v-if="errorMessage" role="alert" class="mt-3 text-sm font-bold text-red-600">
        {{ errorMessage }}
      </p>

      <p v-if="!proofs.length" class="mt-5 text-sm text-ink/60">まだ証明はありません。</p>
      <ul v-else class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li v-for="proof in proofs" :key="proof.id" class="proof-card">
          <a
            :href="downloadUrls[proof.id]"
            target="_blank"
            rel="noopener"
            class="block overflow-hidden rounded-xl border-2 border-ink bg-canvas"
            :aria-label="`${proof.fileName}を開く`"
          >
            <img
              v-if="proof.contentType.startsWith('image/') && downloadUrls[proof.id]"
              :src="downloadUrls[proof.id]"
              :alt="proof.note || proof.fileName"
              class="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
            <span v-else class="grid aspect-[4/3] place-items-center text-ink/60">
              <FileText :size="40" aria-hidden="true" />
            </span>
          </a>
          <p v-if="proof.note" class="mt-2 text-sm font-bold break-words">{{ proof.note }}</p>
          <div class="mt-1 flex items-center justify-between gap-2">
            <p class="min-w-0 text-xs text-ink/60">
              <span class="block truncate">{{ proof.fileName }}</span>
              {{ formatDate(proof.createdAt) }}
            </p>
            <button
              v-if="isOwner"
              type="button"
              class="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-ink bg-white hover:bg-muted/40 disabled:opacity-50"
              aria-label="この証明を削除"
              title="削除"
              :disabled="!!busyProofId"
              @click="remove(proof)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>
    </BaseDialog>
  </div>
</template>

<style scoped>
@reference '../assets/main.css';
.proof-button {
  @apply flex min-h-9 cursor-pointer items-center gap-1 rounded-full border-2 border-ink bg-white px-3 py-1 text-xs font-bold text-ink shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary;
}
.proof-button.has-proof {
  @apply bg-primary text-white;
}
.upload-panel {
  @apply mt-4 grid gap-3 rounded-2xl border-2 border-dashed border-primary bg-white p-4;
}
.pick-button {
  @apply flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-ink bg-accent px-3 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary;
}
.proof-card {
  @apply rounded-2xl border-2 border-ink bg-white p-3;
}
</style>
