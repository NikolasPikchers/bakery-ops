const apiUrl = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

/** Отправить текст в чат. Ошибки логируем, но не роняем вебхук. */
export async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error('telegram sendMessage failed', e);
  }
}

/** Скачать файл по file_id: getFile → file_path → бинарь. */
export async function getFileBytes(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${apiUrl('getFile')}?file_id=${encodeURIComponent(fileId)}`);
  if (!res.ok) throw new Error(`Telegram getFile failed: ${res.status}`);
  const json = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile: нет file_path');
  const fileRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  return new Uint8Array(await fileRes.arrayBuffer());
}
