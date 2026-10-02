<script setup lang="ts">
// 画面の背景に、円形ドットの画像をランダムに置く飾り。
// 画面外にはみ出してもよい配置にし、はみ出した分は overflow-hidden で切り取って横スクロールを出さない。
// 配置は表示したときに1回だけ決める（レイアウトは画面を移動しても作り直されないので、移動しても変わらない）

const random = (min: number, max: number) => min + Math.random() * (max - min)

// 完全なランダムだと3つが1か所に固まることがあるので、画面を3つの区域に分けて1つずつ置く。
// 値はドットの中心位置（画面に対する%）。0未満・100超えは画面外にはみ出す
const zones = [
  // ドットが小さいので、はみ出しは画面外5%までにして、完全に見えなくなるのを防ぐ
  { x: [-10, 30], y: [-5, 30] }, // 左上
  { x: [70, 105], y: [25, 65] }, // 右
  { x: [10, 55], y: [75, 105] }, // 下
]

const dots = zones.map((zone, index) => {
  const size = random(15, 30) // 画面の長い辺に対する大きさ（vmax）
  return {
    id: index,
    style: {
      left: `${random(zone.x[0]!, zone.x[1]!)}%`,
      top: `${random(zone.y[0]!, zone.y[1]!)}%`,
      width: `${size}vmax`,
      opacity: random(0.5, 0.9),

    },
  }
})
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <img
      v-for="dot in dots"
      :key="dot.id"
      src="/images/bg-dot.webp"
      alt=""
      class="absolute max-w-none select-none"
      :style="dot.style"
    />
  </div>
</template>
