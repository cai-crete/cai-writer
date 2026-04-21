// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface TextPart {
  text: string
}

interface InlineDataPart {
  inlineData: {
    data: string
    mimeType: string
  }
}

type ContentPart = TextPart | InlineDataPart

export interface HistoryItem {
  role: 'user' | 'model'
  parts: ContentPart[]
}

// ---------------------------------------------------------------------------
// 스트리밍 메시지 전송 — /api/writer Route 호출
// ---------------------------------------------------------------------------

export async function* sendMessageStream(
  history: HistoryItem[],
  newMsg: string,
  mode: string,
  imageBase64?: string,
  mimeType?: string
): AsyncGenerator<string> {
  const response = await fetch('/api/writer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, newMsg, mode, imageBase64, mimeType }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI 서버 오류 (${response.status}): ${errorText}`)
  }

  if (!response.body) {
    throw new Error('응답 스트림이 없습니다.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (chunk) yield chunk
  }
}
