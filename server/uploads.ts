import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads')

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MAX_BYTES = 3 * 1024 * 1024

export function mimeFromExt(ext: string) {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

export async function saveAvatar(userId: number, file: File) {
  const ext = TYPES[file.type]
  if (!ext) {
    const error = new Error('TYPE')
    ;(error as Error & { code: string }).code = 'TYPE'
    throw error
  }
  if (file.size > MAX_BYTES) {
    const error = new Error('SIZE')
    ;(error as Error & { code: string }).code = 'SIZE'
    throw error
  }

  const dir = path.join(UPLOAD_ROOT, 'avatars')
  await mkdir(dir, { recursive: true })
  await removeAvatarFiles(userId)

  const filename = `${userId}.${ext}`
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()))
  return `/media/avatars/${filename}`
}

export async function readMedia(urlPath: string) {
  const rel = decodeURIComponent(urlPath.replace(/^\/media\/?/, '')).replace(/^\//, '')
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null
  const file = path.resolve(UPLOAD_ROOT, rel)
  if (!file.startsWith(UPLOAD_ROOT + path.sep) && file !== UPLOAD_ROOT) return null
  try {
    const data = await readFile(file)
    return { data, mime: mimeFromExt(path.extname(file).toLowerCase()) }
  } catch {
    return null
  }
}

export async function removeAvatarFiles(userId: number) {
  const dir = path.join(UPLOAD_ROOT, 'avatars')
  try {
    const files = await readdir(dir)
    await Promise.all(
      files
        .filter((name) => name === `${userId}.jpg` || name === `${userId}.jpeg` || name === `${userId}.png` || name === `${userId}.webp`)
        .map((name) => unlink(path.join(dir, name)).catch(() => undefined)),
    )
  } catch {
    return
  }
}
