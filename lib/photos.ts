import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { fitWithin } from './image'

/** Abre a câmera. Cancelado pelo usuário → null. */
export async function takePhoto(): Promise<{ dataUrl: string } | null> {
  try {
    const p = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    })
    return p.dataUrl ? { dataUrl: p.dataUrl } : null
  } catch (e) {
    if (/cancel/i.test((e as Error)?.message ?? '')) return null
    throw e
  }
}

/** Reduz para no máximo `max` px no maior lado, JPEG 0.8. */
export async function resizeForAi(dataUrl: string, max = 1024): Promise<string> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('imagem inválida'))
    img.src = dataUrl
  })
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponível')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)

/** Salva em Directory.Data (privado do app) e devolve o path. */
export async function savePrivate(dataUrl: string, folder: 'meals' | 'body'): Promise<string> {
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  await Filesystem.writeFile({ path, data: base64Of(dataUrl), directory: Directory.Data, recursive: true })
  return path
}

export async function loadPrivate(path: string): Promise<string> {
  const r = await Filesystem.readFile({ path, directory: Directory.Data })
  const data = typeof r.data === 'string' ? r.data : await blobToBase64(r.data)
  return `data:image/jpeg;base64,${data}`
}

export async function deletePrivate(path: string): Promise<void> {
  await Filesystem.deleteFile({ path, directory: Directory.Data })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(base64Of(String(fr.result)))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}
