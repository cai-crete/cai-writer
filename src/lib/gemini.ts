import { GoogleGenAI } from "@google/genai";

// Initialize the API only when needed to prevent issues if key is missing during build
let ai: GoogleGenAI | null = null;

function getAI() {
  if (!ai) {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) {
      console.warn("VITE_GEMINI_API_KEY environment variable is missing.");
    }
    ai = new GoogleGenAI({ apiKey: key || 'MOCK_KEY' });
  }
  return ai;
}

// Model configuration with fallback
const MODEL_ANALYSIS = 'gemini-3-pro-preview';
const MODEL_ANALYSIS_FALLBACK = 'gemini-2.5-pro';

// Protocol file URL map (served as static assets from /public/Protocol/)
const PROTOCOL_FILES = {
  base:             '/Protocol/protocol_base.txt',
  languageAnalysis: '/Protocol/protocol_language_analysis.txt',
  refBook:          '/Protocol/protocol_ref_book.txt',
  validation:       '/Protocol/protocol_validation.txt',
  styleCorrection:  '/Protocol/protocol_style_correction.txt',
  writingStart:     '/Protocol/protocol_writing_start.txt',
  writingRefine:    '/Protocol/protocol_writing_refine.txt',
  imageAnalysis:    '/Protocol/protocol_image_analysis.txt',
} as const;

// Runtime cache so files are only fetched once per session
const protocolCache: Partial<Record<keyof typeof PROTOCOL_FILES, string>> = {};

async function loadProtocol(key: keyof typeof PROTOCOL_FILES): Promise<string> {
  if (protocolCache[key]) return protocolCache[key]!;
  try {
    const res = await fetch(PROTOCOL_FILES[key]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    protocolCache[key] = text;
    return text;
  } catch (e) {
    console.error(`Protocol file load failed [${key}]:`, e);
    return '';
  }
}

// -------------------------------------------------------------
// [Dynamic Protocol Builder]
// 유저의 설정(스타일 모드)과 이미지 첨부 유무에 따라
// Protocol 폴더의 파일들을 동적으로 결합하여 최종 System Instruction을 생성합니다.
// -------------------------------------------------------------
async function buildSystemInstruction(mode: string, hasImage: boolean): Promise<string> {
  // 1. 공통 코어 엔진 주입 (항상 활성)
  const [base, tenTech] = await Promise.all([
    loadProtocol('base'),
    loadProtocol('languageAnalysis'),
  ]);
  let instruction = `[CORE ENGINE]\n${base}\n\n${tenTech}\n\n`;

  instruction += "--------------------------------------------------\n";
  instruction += `현재 설정된 모드: ${mode}\n`;
  instruction += "아래의 모드별 지식창고 원칙을 최우선으로 적용하여 텍스트를 출력하세요.\n";
  instruction += "--------------------------------------------------\n";

  // 2. 모드별 특화 프로토콜 주입
  if (mode === '논문 모드') {
    const [writingStart, writingRefine, validation] = await Promise.all([
      loadProtocol('writingStart'),
      loadProtocol('writingRefine'),
      loadProtocol('validation'),
    ]);
    instruction += `[글쓰기 시작 - 학술 글쓰기 방법론]\n${writingStart}\n\n`;
    instruction += `[학술 글쓰기 정제화 대조 데이터]\n${writingRefine}\n\n`;
    instruction += `[발화검증: Track A (행정/기술 모드)]\n${validation}\n\n`;

  } else if (mode === '고종석 문체') {
    const [refBook, styleCorrection, validation] = await Promise.all([
      loadProtocol('refBook'),
      loadProtocol('styleCorrection'),
      loadProtocol('validation'),
    ]);
    instruction += `[REF.BOOK - 건축적 글쓰기 구조 및 감각 매핑]\n${refBook}\n\n`;
    instruction += `[문체 오류 교정 대조 데이터]\n${styleCorrection}\n\n`;
    instruction += `[발화검증: Track B (비평/에세이 모드)]\n${validation}\n\n`;

  } else {
    // 통합 비평 모드(기본) — default
    const [refBook, validation, styleCorrection] = await Promise.all([
      loadProtocol('refBook'),
      loadProtocol('validation'),
      loadProtocol('styleCorrection'),
    ]);
    instruction += `[REF.BOOK - 건축적 글쓰기 구조 및 감각 매핑]\n${refBook}\n\n`;
    instruction += `[발화검증: Track B (비평/에세이 모드)]\n${validation}\n\n`;
    instruction += `[문체 오류 교정 핵심 발췌]\n${styleCorrection}\n\n`;
  }

  // 3. 비전(이미지) 분석 시스템 주입
  if (hasImage) {
    const imageAnalysis = await loadProtocol('imageAnalysis');
    instruction += "--------------------------------------------------\n";
    instruction += "첨부된 이미지가 있습니다. 이미지의 공간적·물질적 특성을 심층적으로 분석하여 글쓰기에 반영하십시오.\n";
    instruction += "--------------------------------------------------\n";
    instruction += `[건축 이미지 분석 기술서]\n${imageAnalysis}\n\n`;
  }

  // 4. 출력 형식 지시
  instruction += "--------------------------------------------------\n";
  instruction += "[시스템 요구사항]\n";
  instruction += "[[SUMMARY]] 등의 역할극 출력 규격은 절대 사용하지 말고 완성된 유려한 마크다운의 최종 글로만 대답하세요.\n";

  return instruction;
}

export async function* sendMessageStream(
  history: { role: 'user' | 'model', parts: any[] }[],
  newMsg: string,
  mode: string,
  imageBase64?: string,
  mimeType?: string
) {
  const gAi = getAI();
  const hasImage = !!(imageBase64 && mimeType);

  // Build system instruction asynchronously (protocol files loaded via fetch)
  const dynamicSystemInstruction = await buildSystemInstruction(mode, hasImage);

  const formattedHistory = history.map(h => ({
    role: h.role,
    parts: h.parts,
  }));

  const userParts: any[] = [{ text: newMsg }];
  if (hasImage) {
    userParts.push({
      inlineData: {
        data: imageBase64!,
        mimeType: mimeType!,
      },
    });
  }

  const generateWithModel = async (modelName: string) => {
    return await gAi.models.generateContentStream({
      model: modelName,
      contents: [...formattedHistory, { role: "user", parts: userParts }],
      config: {
        systemInstruction: dynamicSystemInstruction,
      },
    });
  };

  try {
    let responseStream;
    try {
      responseStream = await generateWithModel(MODEL_ANALYSIS);
    } catch (e: any) {
      console.warn(`Primary model ${MODEL_ANALYSIS} failed, falling back to ${MODEL_ANALYSIS_FALLBACK}. Error:`, e.message);
      responseStream = await generateWithModel(MODEL_ANALYSIS_FALLBACK);
    }

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    yield "\n\n**에러 발생:** AI 응답을 불러오는 중에 문제가 발생했습니다.";
  }
}
