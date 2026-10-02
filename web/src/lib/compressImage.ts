const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8

/**
 * スマホ写真は数MBあるので、アップロード前に長辺1600pxのJPEGへ縮小する。
 * GIF（アニメが消える）や画像以外、縮小に失敗した画像は元のファイルをそのまま返す。
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    // スマホ写真の向き（EXIF）を反映して読み込む
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    // 縮小しても大きくなる場合（小さいPNGなど）は元のファイルを使う
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch (error) {
    console.warn('画像を縮小できなかったため、元のファイルを使います', error)
    return file
  }
}
