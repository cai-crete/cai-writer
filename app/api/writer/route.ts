import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { GoogleGenAI } from '@google/genai'
import { buildSystemPrompt } from '@/lib/prompt'

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

interface HistoryItem {
  role: 'user' | 'model'
  parts: ContentPart[]
}

// ---------------------------------------------------------------------------
// 모델 설정
// ---------------------------------------------------------------------------

const MODEL_PRIMARY = 'gemini-3-pro-preview'
const MODEL_FALLBACK = 'gemini-2.5-pro'

// ---------------------------------------------------------------------------
// Protocol 파일 경로 맵 (_context/Protocol/ 서버 사이드 읽기)
// ---------------------------------------------------------------------------

const PROTOCOL_DIR = path.join(process.cwd(), '_context', 'Protocol')

const PROTOCOL_FILES = {
  base:             'protocol-writer-v1.txt',
  languageAnalysis: 'protocol_language_analysis.txt',
  refBook:          'protocol_ref_book.txt',
  validation:       'protocol_validation.txt',
  styleCorrection:  'protocol_style_correction.txt',
  writingStart:     'protocol_writing_start.txt',
  writingRefine:    'protocol_writing_refine.txt',
  imageAnalysis:    'protocol_image_analysis.txt',
} as const

async function readProtocol(key: keyof typeof PROTOCOL_FILES): Promise<string> {
  const filePath = path.join(PROTOCOL_DIR, PROTOCOL_FILES[key])
  return readFile(filePath, 'utf-8')
}

// ---------------------------------------------------------------------------
// [Dynamic Protocol Builder]
// 스타일 모드와 이미지 첨부 유무에 따라 Protocol 파일들을 결합하여
// 최종 System Instruction을 생성합니다.
// buildSystemPrompt()를 통해서만 결합합니다 (ARCHITECTURE.md 불변식).
// ---------------------------------------------------------------------------

async function buildSystemInstruction(
  mode: string,
  hasImage: boolean
): Promise<string> {
  // 1. Principle Protocol + 공통 Core (항상 활성)
  const [principleProtocol, tenTech] = await Promise.all([
    readProtocol('base'),
    readProtocol('languageAnalysis'),
  ])

  const modeHeader = [
    '--------------------------------------------------',
    `현재 설정된 모드: ${mode}`,
    '아래의 모드별 지식창고 원칙을 최우선으로 적용하여 텍스트를 출력하세요.',
    '--------------------------------------------------',
  ].join('\n')

  // 2. 모드별 Knowledge Docs 선택
  let knowledgeDocs: string[]

  if (mode === '논문 모드') {
    const [writingStart, writingRefine, validation] = await Promise.all([
      readProtocol('writingStart'),
      readProtocol('writingRefine'),
      readProtocol('validation'),
    ])
    knowledgeDocs = [
      tenTech,
      modeHeader,
      `[글쓰기 시작 - 학술 글쓰기 방법론]\n${writingStart}`,
      `[학술 글쓰기 정제화 대조 데이터]\n${writingRefine}`,
      `[발화검증: Track A (행정/기술 모드)]\n${validation}`,
    ]
  } else if (mode === '감각 에세이 모드') {
    const [refBook, styleCorrection, validation] = await Promise.all([
      readProtocol('refBook'),
      readProtocol('styleCorrection'),
      readProtocol('validation'),
    ])
    knowledgeDocs = [
      tenTech,
      modeHeader,
      `[REF.BOOK - 건축적 글쓰기 구조 및 감각 매핑]\n${refBook}`,
      `[문체 오류 교정 대조 데이터]\n${styleCorrection}`,
      `[발화검증: Track B (비평/에세이 모드)]\n${validation}`,
    ]
  } else {
    // 통합 비평 모드(기본)
    const [refBook, validation, styleCorrection] = await Promise.all([
      readProtocol('refBook'),
      readProtocol('validation'),
      readProtocol('styleCorrection'),
    ])
    knowledgeDocs = [
      tenTech,
      modeHeader,
      `[REF.BOOK - 건축적 글쓰기 구조 및 감각 매핑]\n${refBook}`,
      `[발화검증: Track B (비평/에세이 모드)]\n${validation}`,
      `[문체 오류 교정 핵심 발췌]\n${styleCorrection}`,
    ]
  }

  // 3. 이미지 분석 Knowledge Doc 추가 (선택)
  if (hasImage) {
    const imageAnalysis = await readProtocol('imageAnalysis')
    knowledgeDocs.push(
      '--------------------------------------------------\n' +
      '첨부된 이미지가 있습니다. 이미지의 공간적·물질적 특성을 심층적으로 분석하여 글쓰기에 반영하십시오.\n' +
      '--------------------------------------------------',
      `[건축 이미지 분석 기술서]\n${imageAnalysis}`
    )
  }

  // 4. 출력 형식 지시 (후위 Knowledge Doc으로 주입)
  knowledgeDocs.push(
    '--------------------------------------------------\n' +
    '[시스템 요구사항]\n' +
    '[[SUMMARY]] 등의 역할극 출력 규격은 절대 사용하지 말고 완성된 유려한 마크다운의 최종 글로만 대답하세요.'
  )

  return buildSystemPrompt(principleProtocol, knowledgeDocs)
}

// ---------------------------------------------------------------------------
// POST 핸들러 — 스트리밍 응답
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.', { status: 500 })
  }

  let body: {
    history: HistoryItem[]
    newMsg: string
    mode: string
    imageBase64?: string
    mimeType?: string
  }

  try {
    body = await req.json()
  } catch {
    return new Response('요청 본문을 파싱할 수 없습니다.', { status: 400 })
  }

  const { history, newMsg, mode, imageBase64, mimeType } = body

  if (typeof newMsg !== 'string' || typeof mode !== 'string') {
    return new Response('newMsg, mode 필드가 필요합니다.', { status: 400 })
  }

  // 입력 검증 (SECURITY.md §입력 검증)
  if (newMsg.length > 2000) {
    return new Response('텍스트 입력은 2000자를 초과할 수 없습니다.', { status: 400 })
  }
  if (imageBase64 && Buffer.byteLength(imageBase64, 'base64') > 10 * 1024 * 1024) {
    return new Response('이미지 크기는 10MB를 초과할 수 없습니다.', { status: 400 })
  }

  const hasImage = !!(imageBase64 && mimeType)

  let systemInstruction: string
  try {
    systemInstruction = await buildSystemInstruction(mode, hasImage)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return new Response(`Protocol 파일 로드 실패: ${reason}`, { status: 500 })
  }

  const userParts: ContentPart[] = [{ text: newMsg }]
  if (hasImage) {
    userParts.push({
      inlineData: {
        data: imageBase64!,
        mimeType: mimeType!,
      },
    })
  }

  const contents = [
    ...history,
    { role: 'user' as const, parts: userParts },
  ]

  const gAi = new GoogleGenAI({ apiKey })

  const generateWithModel = async (modelName: string) => {
    return gAi.models.generateContentStream({
      model: modelName,
      contents,
      config: { systemInstruction },
    })
  }

  let responseStream
  try {
    responseStream = await generateWithModel(MODEL_PRIMARY)
  } catch (primaryErr: unknown) {
    const reason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    try {
      responseStream = await generateWithModel(MODEL_FALLBACK)
    } catch (fallbackErr: unknown) {
      const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      return new Response(
        `AI 모델 호출 실패.\nPrimary(${MODEL_PRIMARY}): ${reason}\nFallback(${MODEL_FALLBACK}): ${fallbackReason}`,
        { status: 502 }
      )
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of responseStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
