'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, User, Send, Menu, Settings2, BookMarked, BrainCircuit, PanelLeftClose, PanelRightClose, Image as ImageIcon, X, Download, Trash2, Plus, Library } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { sendMessageStream, type HistoryItem } from '@/lib/gemini'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const STYLES = ['통합 비평 모드(기본)', '감각 에세이 모드', '논문 모드']

export default function Page() {
  const {
    sessions,
    currentSessionId,
    messages,
    loadSessions,
    createNewSession,
    loadSessionData,
    deleteSessionData,
    addMessage,
    updateMessage
  } = useStore()
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(true)
  const [activeStyle, setActiveStyle] = useState(STYLES[0])
  const [selectedImage, setSelectedImage] = useState<{ url: string; base64: string; mimeType: string } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const init = async () => {
      await loadSessions()
      if (useStore.getState().sessions.length === 0) {
        await createNewSession()
      } else if (!useStore.getState().currentSessionId) {
        await loadSessionData(useStore.getState().sessions[0].id)
      }
    }
    init()
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setSelectedImage({
        url: result,
        base64,
        mimeType: file.type
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const exportToMarkdown = () => {
    const markdownContent = messages.map(m => `### ${m.role === 'model' ? 'AI (cai-writer)' : 'User'}\n\n${m.content}\n\n`).join('---\n\n')
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cai-writer-export.md'
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportToPdf = () => {
    window.print()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!inputMessage.trim() && !selectedImage) || isTyping) return

    const newUserMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputMessage,
      imagePreview: selectedImage?.url,
      imageBase64: selectedImage?.base64,
      mimeType: selectedImage?.mimeType
    }

    addMessage(newUserMsg)
    setInputMessage('')
    const currentSelectedImage = selectedImage
    setSelectedImage(null)
    setIsTyping(true)

    const aiMsgId = (Date.now() + 1).toString()
    addMessage({ id: aiMsgId, role: 'model', content: '' })

    try {
      const historyForApi: HistoryItem[] = messages.map(m => {
        const parts: HistoryItem['parts'] = [{ text: m.content }]
        if (m.imageBase64 && m.mimeType) {
          parts.push({
            inlineData: {
              data: m.imageBase64,
              mimeType: m.mimeType
            }
          })
        }
        return { role: m.role, parts }
      })

      const stream = sendMessageStream(
        historyForApi,
        newUserMsg.content,
        activeStyle,
        currentSelectedImage?.base64,
        currentSelectedImage?.mimeType
      )

      let fullAiResponse = ''
      for await (const chunk of stream) {
        fullAiResponse += chunk
        updateMessage(aiMsgId, { content: fullAiResponse })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 응답 오류가 발생했습니다.'
      updateMessage(aiMsgId, { content: `오류: ${message}` })
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="flex h-screen w-full bg-[#fcfcfc] overflow-hidden font-sans relative">
      {leftOpen && (
        <div className="fixed inset-0 bg-black/10 z-40 lg:hidden" onClick={() => setLeftOpen(false)} />
      )}
      {/* Left Sidebar - Library (Floating) */}
      <div
        className={cn(
          "fixed lg:absolute left-0 lg:left-4 top-0 lg:top-4 bottom-0 lg:bottom-4 w-[85vw] max-w-sm lg:w-72 bg-white/90 backdrop-blur-md rounded-none lg:rounded-2xl shadow-[0_8px_32px_rgb(0,0,0,0.06)] border-r lg:border border-neutral-200/50 z-50 transition-all duration-300 ease-out flex flex-col overflow-hidden print:hidden",
          leftOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none"
        )}
      >
        <div className="p-4 border-b border-neutral-100/60">
          <div className="flex items-center justify-between mb-3 lg:hidden">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Library</span>
            <button onClick={() => setLeftOpen(false)} className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => createNewSession()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-black text-white rounded-xl hover:bg-neutral-800 transition-all shadow-sm group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            <span className="text-[11px] font-black uppercase tracking-widest">New Chat</span>
          </button>
        </div>
        <div className={cn("flex-1 overflow-y-auto p-4 custom-scrollbar")}>
          <div className="flex flex-col gap-2">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                <Library className="w-8 h-8 text-neutral-300 mb-2" />
                <p className="text-[10px] font-bold tracking-widest text-neutral-400 text-center">저장된 세션이 없습니다</p>
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = currentSessionId === session.id
                return (
                  <div
                    key={session.id}
                    onClick={() => loadSessionData(session.id)}
                    className={cn(
                      "group relative p-3 rounded-[10px] border cursor-pointer transition-colors",
                      isActive ? "border-black bg-black text-white" : "border-border bg-white hover:bg-neutral-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <h4 className={cn("text-[12px] font-bold mb-1 leading-tight flex-1 min-w-0 truncate", isActive ? "text-white" : "text-neutral-800")}>
                        {session.title}
                      </h4>
                      <button
                        onClick={(e) => deleteSessionData(session.id, e)}
                        className={cn(
                          "opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded flex-shrink-0",
                          isActive ? "text-neutral-400 hover:text-red-300" : "text-neutral-400 hover:text-red-500"
                        )}
                        title="세션 삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className={cn("text-[9px]", isActive ? "text-neutral-300" : "text-neutral-400")}>
                      {new Date(session.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Center - Main Chat Area (Full Background) */}
      <div className="flex-1 flex flex-col h-full relative z-10 min-w-0 bg-transparent">

        {/* Header - Floating Top */}
        <header className="absolute top-0 left-0 right-0 h-[70px] flex items-center justify-between px-4 lg:px-6 z-30 pointer-events-none print:hidden">
          <div className="pointer-events-auto mt-4">
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)} className="w-[44px] h-[44px] bg-white border border-neutral-200/60 rounded-xl shadow-[0_2px_8px_rgb(0,0,0,0.04)] flex items-center justify-center hover:bg-neutral-50 transition-all">
                <Menu className="w-[18px] h-[18px] text-neutral-600" />
              </button>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-3 bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-neutral-200/50 shadow-[0_4px_24px_rgb(0,0,0,0.04)] mt-4 transition-all">
            <h1 className="font-bebas text-[18px] text-ink tracking-wide">CAI-WRITER</h1>
            <span className="opacity-30 text-neutral-400">|</span>
            <span className="font-bebas text-[14px] text-neutral-500 tracking-widest">
              PROJECT: {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title.substring(0, 24) : 'THE_MODERN_VOID'}
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-3 mt-4">
            <div className="bg-white/80 backdrop-blur-md border border-neutral-200/50 shadow-[0_2px_8px_rgb(0,0,0,0.04)] hidden sm:flex rounded-xl p-1 items-center">
              <button onClick={exportToMarkdown} className="px-3 py-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-all text-[12px] font-bold rounded-lg flex gap-1.5 items-center"><Download className="w-3.5 h-3.5" />MD</button>
              <button onClick={exportToPdf} className="px-3 py-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-all text-[12px] font-bold rounded-lg">PDF</button>
            </div>
            {!rightOpen && (
              <button onClick={() => setRightOpen(true)} className="w-[44px] h-[44px] bg-white border border-neutral-200/60 rounded-xl shadow-[0_2px_8px_rgb(0,0,0,0.04)] flex items-center justify-center hover:bg-neutral-50 transition-all">
                <Settings2 className="w-[18px] h-[18px] text-neutral-600" />
              </button>
            )}
          </div>
        </header>

        {/* Chat Messages */}
        <main className="flex-1 overflow-y-auto print:overflow-visible p-[20px] pt-[90px] md:p-[40px] md:pt-[100px] bg-transparent print:bg-white custom-scrollbar relative z-10 w-full flex-col flex items-center">
          <div className="w-full max-w-[700px] space-y-6 pb-20 print:pb-0 font-sans">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                <div className={cn(
                  "p-4 max-w-[85%] text-[14px] leading-[1.6] relative rounded-[10px]",
                  msg.role === 'user'
                    ? "bg-black text-white"
                    : "bg-white border border-gray-200 text-black font-serif"
                )}>
                  {msg.role === 'user' ? (
                    <div className="flex flex-col gap-3">
                      {msg.imagePreview && (
                        <img src={msg.imagePreview} alt="Uploaded" className="max-w-xs border border-white/20" />
                      )}
                      {msg.content && <p className="whitespace-pre-wrap font-sans">{msg.content}</p>}
                    </div>
                  ) : (
                    <div className="markdown-body">
                      {msg.content === '' ? (
                        <div className="flex gap-1 items-center h-4">
                          <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" />
                          <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-75" />
                          <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce delay-150" />
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          div: ({ node, className, children, ...props }) => {
                            if (className === 'replacement-tag') {
                              return <div className="replacement-tag" {...props}>{children}</div>
                            }
                            return <div className={className} {...props}>{children}</div>
                          }
                        }}>
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Area Overlay */}
        <div className="px-4 pb-6 pt-2 bg-gradient-to-t !from-[#fcfcfc] !via-[#fcfcfc]/90 !to-transparent print:hidden absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          <div className="w-full max-w-[700px] mx-auto pointer-events-auto">
            {selectedImage && (
              <div className="mb-3 relative inline-block">
                <img src={selectedImage.url} alt="Preview" className="h-[80px] border border-gray-200 shadow-sm object-cover rounded-[8px]" />
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-white border border-gray-200 p-1 text-black hover:bg-neutral-50 transition-all rounded-full shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="relative flex flex-col bg-white border border-neutral-200/80 p-[15px] focus-within:border-black/50 transition-all min-h-[100px] rounded-2xl shadow-[0_8px_32px_rgb(0,0,0,0.04)]">
              <div className="flex gap-2 h-full">
                <label className="text-gray-500 hover:text-black transition-none cursor-pointer shrink-0 border border-transparent hover:border-gray-200 rounded-md h-6 w-6 flex items-center justify-center">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <ImageIcon className="w-4 h-4" />
                </label>
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                  placeholder="건축적 사유를 입력하세요... (e.g., 빛의 침투, 공간의 켜, 물성의 전이)"
                  className="flex-1 bg-transparent border-0 focus:ring-0 resize-none px-1 text-black placeholder:text-gray-400 font-sans text-sm w-full h-full outline-none"
                />
              </div>
              <div className="flex justify-between items-center mt-[5px] text-[12px] text-gray-500 w-full font-sans font-medium opacity-80">
                <div className="flex items-center gap-2">
                  <span>Acoustic Sanding: Active | BRAIN Mode</span>
                </div>
                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && !selectedImage) || isTyping}
                  className="bg-black text-white px-6 font-bebas text-[16px] tracking-wide disabled:opacity-50 transition-none h-[52px] rounded-full flex items-center justify-center shrink-0 min-w-[100px] leading-none cursor-pointer shadow-sm"
                >
                  GENERATE
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {rightOpen && (
        <div className="fixed inset-0 bg-black/10 z-40 lg:hidden" onClick={() => setRightOpen(false)} />
      )}
      {/* Right Sidebar - Dashboard (Floating) */}
      <div
        className={cn(
          "fixed lg:absolute right-0 lg:right-4 top-0 lg:top-4 bottom-0 lg:bottom-4 w-[85vw] max-w-sm lg:w-[320px] bg-white/90 backdrop-blur-md rounded-none lg:rounded-2xl shadow-[0_8px_32px_rgb(0,0,0,0.06)] border-l lg:border border-neutral-200/50 z-50 transition-all duration-300 ease-out flex flex-col overflow-hidden print:hidden",
          rightOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
        )}
      >
        <div className="p-4 border-b border-neutral-100/60 flex items-center justify-between">
          <h2 className="font-bebas text-[16px] tracking-widest text-ink flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-ink opacity-60" /> INSIGHT DASHBOARD
          </h2>
          <button onClick={() => setRightOpen(false)} className="text-neutral-400 hover:text-black hover:bg-neutral-100 p-1.5 rounded-lg transition-colors">
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
          {/* Style Selector */}
          <section>
            <h3 className="font-bebas text-[13px] text-neutral-400 uppercase tracking-widest mb-3">스타일 템플릿</h3>
            <div className="flex flex-col gap-2">
              {STYLES.map(style => (
                <button
                  key={style}
                  onClick={() => setActiveStyle(style)}
                  className={cn(
                    "w-full text-left px-4 h-[44px] border transition-all flex justify-between items-center cursor-pointer font-bebas text-[15px] tracking-wide rounded-xl shadow-sm",
                    activeStyle === style
                      ? "bg-black border-black text-white"
                      : "bg-white border-neutral-200 text-neutral-600 hover:border-black hover:text-black"
                  )}
                >
                  {style}
                  {activeStyle === style && <span className="text-[10px]">●</span>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-2 leading-[1.4] font-sans">
              선택한 템플릿에 따라 AI의 어조, 단어의 물성, 문장의 호흡이 실시간으로 변환됩니다.
            </p>
          </section>

          {/* Image Analysis Standin */}
          {selectedImage && (
            <section>
              <h3 className="font-bebas text-[14px] text-neutral-400 uppercase tracking-widest mb-3">이미지 스캔</h3>
              <div className="w-full h-[120px] bg-neutral-50/50 border-dashed border border-neutral-300 rounded-xl flex items-center justify-center text-[12px] text-neutral-400 text-center p-[10px]">
                <span className="font-black tracking-widest">SITE_ANALYSIS_READY</span><br /><br />(13-Step Ontology Scan Ready)
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
