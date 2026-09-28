import { getPool } from './db'
import { getSetting } from './settings'

type SendResult = {
  ok: boolean
  message_id?: number
  error?: string
  raw?: unknown
}

export async function telegramConfigured() {
  const tg = await getSetting('telegram')
  return Boolean(tg.enabled && tg.bot_token.trim() && tg.chat_id.trim())
}

export async function sendTelegramMessage(
  text: string,
  options?: {
    chatId?: string
    replyMarkup?: unknown
    parseMode?: 'HTML' | 'Markdown'
  },
): Promise<SendResult> {
  const tg = await getSetting('telegram')
  const token = tg.bot_token.trim()
  const chatId = (options?.chatId || tg.chat_id).trim()
  if (!token || !chatId) {
    return { ok: false, error: 'មិនទាន់កំណត់ Telegram bot token ឬ chat id' }
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }
  if (options?.parseMode) body.parse_mode = options.parseMode
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      result?: { message_id?: number }
      description?: string
    } | null
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.description || `Telegram error (${response.status})`, raw: data }
    }
    const messageId = data.result?.message_id
    await getPool().query(
      `INSERT INTO telegram_outbox (chat_id, message_id, kind, payload, status)
       VALUES ($1, $2, 'message', $3::jsonb, 'sent')`,
      [chatId, messageId || null, JSON.stringify({ text: text.slice(0, 500) })],
    )
    return { ok: true, message_id: messageId, raw: data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Telegram send failed'
    return { ok: false, error: message }
  }
}

/** Send a PNG/JPEG photo to Telegram (A4 week sheet, etc.). */
export async function sendTelegramPhoto(
  imageBytes: Buffer | Uint8Array,
  options?: {
    chatId?: string
    caption?: string
    filename?: string
  },
): Promise<SendResult> {
  const tg = await getSetting('telegram')
  const token = tg.bot_token.trim()
  const chatId = (options?.chatId || tg.chat_id).trim()
  if (!token || !chatId) {
    return { ok: false, error: 'មិនទាន់កំណត់ Telegram bot token ឬ chat id' }
  }

  const form = new FormData()
  form.append('chat_id', chatId)
  if (options?.caption) form.append('caption', options.caption.slice(0, 1024))
  const blob = new Blob([Uint8Array.from(imageBytes)], { type: 'image/png' })
  form.append('photo', blob, options?.filename || 'attendance-week.png')

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      result?: { message_id?: number }
      description?: string
    } | null
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.description || `Telegram error (${response.status})`, raw: data }
    }
    const messageId = data.result?.message_id
    await getPool().query(
      `INSERT INTO telegram_outbox (chat_id, message_id, kind, payload, status)
       VALUES ($1, $2, 'photo', $3::jsonb, 'sent')`,
      [chatId, messageId || null, JSON.stringify({ caption: (options?.caption || '').slice(0, 200) })],
    )
    return { ok: true, message_id: messageId, raw: data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Telegram photo send failed'
    return { ok: false, error: message }
  }
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  const tg = await getSetting('telegram')
  const token = tg.bot_token.trim()
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || 'បានបញ្ជាក់',
      show_alert: false,
    }),
  }).catch(() => null)
}

export async function handleTelegramUpdate(update: {
  update_id?: number
  callback_query?: {
    id: string
    data?: string
    from?: { id?: number; username?: string }
    message?: { chat?: { id?: number }; message_id?: number }
  }
}) {
  const cb = update.callback_query
  if (!cb?.data) return { handled: false }

  const [action, type, date, kutiId] = cb.data.split(':')
  if (action !== 'confirm' || !type || !date) {
    await answerTelegramCallback(cb.id, 'ទិន្នន័យមិនត្រឹមត្រូវ')
    return { handled: true }
  }

  await getPool().query(
    `INSERT INTO telegram_outbox (chat_id, message_id, kind, payload, status)
     VALUES ($1, $2, 'confirm', $3::jsonb, 'confirmed')`,
    [
      String(cb.message?.chat?.id || ''),
      cb.message?.message_id || null,
      JSON.stringify({
        type,
        date,
        kuti_id: kutiId ? Number(kutiId) : null,
        from: cb.from || null,
        confirmed_at: new Date().toISOString(),
      }),
    ],
  )
  await answerTelegramCallback(cb.id, `បានបញ្ជាក់ ${type} ${date}`)
  return { handled: true }
}

let pollOffset = 0
let polling = false

export async function pollTelegramUpdatesOnce() {
  const tg = await getSetting('telegram')
  if (!tg.enabled || !tg.bot_token.trim()) return
  const token = tg.bot_token.trim()
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`)
  url.searchParams.set('timeout', '0')
  url.searchParams.set('offset', String(pollOffset))
  const response = await fetch(url)
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean
    result?: Array<{ update_id: number } & Parameters<typeof handleTelegramUpdate>[0]>
  } | null
  if (!data?.ok || !Array.isArray(data.result)) return
  for (const update of data.result) {
    pollOffset = update.update_id + 1
    await handleTelegramUpdate(update)
  }
}

export function startTelegramPolling() {
  if (polling) return
  polling = true
  const tick = async () => {
    try {
      await pollTelegramUpdatesOnce()
    } catch (error) {
      console.warn('telegram poll failed', error)
    } finally {
      setTimeout(tick, 4000)
    }
  }
  void tick()
}
