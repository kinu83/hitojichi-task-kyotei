<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const online = ref(navigator.onLine)
const dismissed = ref(false)
const updateError = ref(false)
const updating = ref(false)
const { needRefresh, updateServiceWorker } = useRegisterSW()

function syncConnection() {
  online.value = navigator.onLine
}

async function applyUpdate() {
  updating.value = true
  updateError.value = false
  try {
    await updateServiceWorker(true)
  } catch {
    updateError.value = true
  } finally {
    updating.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', syncConnection)
  window.addEventListener('offline', syncConnection)
})

onUnmounted(() => {
  window.removeEventListener('online', syncConnection)
  window.removeEventListener('offline', syncConnection)
})
</script>

<template>
  <aside
    v-if="!online || (needRefresh && !dismissed)"
    class="border-b-2 border-ink bg-canvas px-4 py-3 text-sm text-ink"
    role="status"
    aria-live="polite"
  >
    <template v-if="!online">
      <p class="font-bold">オフラインです</p>
      <p>
        画面は開けますが、ログイン・最新データの取得・保存には通信が必要です。接続が戻ってから操作してください。
      </p>
    </template>
    <template v-else>
      <p>新しいバージョンがあります。入力中の内容を保存してから更新してください。</p>
      <div class="mt-2 flex gap-3">
        <button
          class="rounded-lg border-2 border-ink bg-primary px-3 py-1 font-bold text-canvas shadow-sm disabled:opacity-50"
          :disabled="updating"
          @click="applyUpdate"
        >
          {{ updating ? '更新中…' : '更新して再読み込み' }}
        </button>
        <button
          class="rounded-lg border-2 border-ink px-3 py-1 shadow-sm"
          @click="dismissed = true"
        >
          あとで
        </button>
      </div>
      <p v-if="updateError" class="mt-2">
        更新できませんでした。接続を確認して、もう一度お試しください。
      </p>
    </template>
  </aside>
</template>
