
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { SYSTEM_PROMPT, KNOWLEDGE_BASE_DATA, COMPANY_CONFIG, TELEGRAM_CONFIG } from './constants';
import { decode, decodeAudioData, createBlob, downsampleBuffer } from './utils/audioUtils';

// --- Types ---

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

type SupportMode = 'chat' | 'kb' | 'report';

// --- Helper Functions ---

async function sendTelegramAlert(data: { category: string, username: string, subject: string, device: string, description: string, image?: File | null }) {
  const messageText = `🚨 NEW TICKET [${data.category.toUpperCase()}]\n\nUser: ${data.username}\nSubject: ${data.subject}\nDevice: ${data.device}\nDescription: ${data.description}\n\nTime: ${new Date().toLocaleString()}`;

  let url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`;
  const formData = new FormData();
  formData.append('chat_id', TELEGRAM_CONFIG.chatId);

  if (data.image) {
    url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendPhoto`;
    formData.append('photo', data.image);
    formData.append('caption', messageText);
  } else {
    formData.append('text', messageText);
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  const responseData = await response.json();
  if (!response.ok || !responseData.ok) {
    throw new Error(responseData.description || 'Failed to send Telegram message');
  }
  return true;
}

// --- Tool Definitions ---

const reportIssueTool: FunctionDeclaration = {
  name: "report_issue",
  description: "Submit a support ticket, report an outage, or escalate a restore service request to technicians via Telegram.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        enum: ["Technical Outage", "Restore Service"],
        description: "The type of issue."
      },
      username: {
        type: Type.STRING,
        description: "The confirmed username of the customer."
      },
      subject: {
        type: Type.STRING,
        description: "A brief title or subject for the issue."
      },
      device: {
        type: Type.STRING,
        description: "The device the customer is using (e.g., Firestick)."
      },
      description: {
        type: Type.STRING,
        description: "Detailed description of the problem."
      }
    },
    required: ["category", "username", "subject", "device", "description"]
  }
};

// --- UI Components ---

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning', isLoading?: boolean }> = ({ children, variant = 'primary', className = '', isLoading, ...props }) => {
  const variants = {
    primary: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90 shadow-md',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/80',
    outline: 'border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
    ghost: 'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 text-zinc-500',
    destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-zinc-50 dark:hover:bg-red-800 shadow-md',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 shadow-md',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:text-zinc-50 dark:hover:bg-amber-700 shadow-md'
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 sm:px-4 text-xs sm:text-sm font-bold uppercase tracking-tight transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending...
        </>
      ) : children}
    </button>
  );
};

const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error'; className?: string }> = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50 ${className}`}>
    {children}
  </div>
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...props }, ref) => (
  <input
    ref={ref}
    className={`flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:text-zinc-50 ${className}`}
    {...props}
  />
));

const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`flex min-h-[100px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:text-zinc-50 ${className}`}
    {...props}
  />
));

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className = '', children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={`flex h-10 w-full appearance-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:text-zinc-50 ${className}`}
      {...props}
    >
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
    </div>
  </div>
));

const AccordionItem: React.FC<{ title: string; content: string; isOpen: boolean; onClick: () => void }> = ({ title, content, isOpen, onClick }) => (
  <div className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 overflow-hidden">
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left group transition-all"
    >
      <span className={`text-sm font-bold uppercase tracking-tight transition-colors ${isOpen ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-800 dark:group-hover:text-zinc-300'}`}>
        {title}
      </span>
      <svg
        className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-zinc-900 dark:text-zinc-100' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100 pb-6' : 'max-h-0 opacity-0'}`}>
      <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap font-medium">
        {content}
      </p>
    </div>
  </div>
);

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => (
  <div className={`flex flex-col mb-4 sm:mb-6 ${message.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
    <div className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm shadow-sm whitespace-pre-line ${message.role === 'user'
      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
      : 'bg-white text-zinc-900 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800'
      }`}>
      {message.text}
    </div>
    <span className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-tighter px-1">
      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  </div>
);

export default function App() {
  const [mode, setMode] = useState<SupportMode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Welcome to ${COMPANY_CONFIG.name} Support! 👋\n\nTo ensure we pull up the correct account, please start by **spelling out your Username**.`,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [kbOpenId, setKbOpenId] = useState<string | null>(null);
  const [kbSearchQuery, setKbSearchQuery] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice State Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const isMicMutedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const toggleKb = (id: string) => setKbOpenId(kbOpenId === id ? null : id);

  const filteredKbData = useMemo(() => {
    if (!kbSearchQuery.trim()) return KNOWLEDGE_BASE_DATA;
    const lowerQuery = kbSearchQuery.toLowerCase();
    return KNOWLEDGE_BASE_DATA.map(cat => ({
      ...cat,
      articles: cat.articles.filter(art =>
        art.title.toLowerCase().includes(lowerQuery) ||
        art.content.toLowerCase().includes(lowerQuery)
      )
    })).filter(cat => cat.articles.length > 0);
  }, [kbSearchQuery]);

  const handleReportSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsReporting(true);
    setReportStatus(null);

    const formData = new FormData(e.currentTarget);
    const category = formData.get('category') as string;
    const username = formData.get('username') as string;
    const subject = formData.get('subject') as string;
    const device = formData.get('device') as string;
    const description = formData.get('description') as string;
    const attachment = formData.get('attachment') as File;

    try {
      await sendTelegramAlert({
        category,
        username,
        subject,
        device,
        description,
        image: attachment && attachment.size > 0 ? attachment : null
      });
      setReportStatus({ type: 'success', message: 'Report submitted successfully! Technicians have been alerted via Telegram.' });
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error("Network/Reporting Error:", error);
      setReportStatus({ type: 'error', message: `Failed to alert technicians. Please try again or text ${COMPANY_CONFIG.supportNumber}.` });
    } finally {
      setIsReporting(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: 'user', text, timestamp: new Date() };

    const history = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts: [{ text }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT
        }
      });

      const aiText = response.text || "I'm having trouble connecting right now.";
      setMessages(prev => [...prev, { role: 'assistant', text: aiText, timestamp: new Date() }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', text: "Sorry, I'm having trouble processing that request.", timestamp: new Date() }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleReportNavClick = () => {
    setMode('report');
  };

  const startVoice = useCallback(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Crucial: resume audio context to ensure playback is not blocked by browser policy
      await inputCtx.resume();
      await outputCtx.resume();

      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (e) => {
              if (isMicMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);

              const currentRate = inputCtx.sampleRate;
              let pcmData = inputData;
              if (currentRate !== 16000) pcmData = downsampleBuffer(inputData, currentRate, 16000);

              const pcmBlob = createBlob(pcmData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            setIsVoiceActive(true);
            setIsMicMuted(false);

            // PROACTIVE INITIATION: Trigger the model to greet immediately by sending 0.1s silence.
            sessionPromise.then(session => {
              const startTickle = new Float32Array(1600); // 0.1s silence @ 16kHz
              session.sendRealtimeInput({ media: createBlob(startTickle) });
            });
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'report_issue') {
                  const args = fc.args as any;
                  let result = "Failed to send report.";
                  try {
                    await sendTelegramAlert({
                      category: args.category,
                      username: args.username,
                      subject: args.subject,
                      device: args.device,
                      description: args.description
                    });
                    result = "Report sent successfully to our Telegram Channel. Technicians have been notified.";
                  } catch (e) {
                    console.error("Tool execution failed", e);
                  }

                  sessionPromise.then(session => session.sendToolResponse({
                    functionResponses: {
                      id: fc.id,
                      name: fc.name,
                      response: { result }
                    }
                  }));
                }
              }
            }

            const { serverContent } = msg;
            if (serverContent?.outputTranscription) currentOutputTranscriptionRef.current += serverContent.outputTranscription.text;
            if (serverContent?.inputTranscription) currentInputTranscriptionRef.current += serverContent.inputTranscription.text;

            if (serverContent?.turnComplete) {
              const userText = currentInputTranscriptionRef.current.trim();
              const assistantText = currentOutputTranscriptionRef.current.trim();
              if (userText || assistantText) {
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (userText) newMessages.push({ role: 'user', text: userText, timestamp: new Date() });
                  if (assistantText) newMessages.push({ role: 'assistant', text: assistantText, timestamp: new Date() });
                  return newMessages;
                });
              }
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            // Iterate through all parts of the model turn to find audio data
            const parts = serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              const base64Audio = part.inlineData?.data;
              if (base64Audio) {
                // Ensure context is running
                if (outputCtx.state === 'suspended') await outputCtx.resume();

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const buffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                const source = outputCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outputCtx.destination);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
                source.onended = () => sourcesRef.current.delete(source);
              }
            }

            if (serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) { }
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            setIsVoiceActive(false);
          },
          onerror: (e) => {
            console.error("Voice Error:", e);
            setIsVoiceActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: [reportIssueTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("Voice startup failed:", err);
    }
  }, []);

  const stopVoice = useCallback(() => {
    setIsVoiceActive(false);
    setIsMicMuted(false);

    // Properly close the Live API session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        try { session.close(); } catch (e) { }
      });
      sessionPromiseRef.current = null;
    }

    // Stop all active sources and close contexts
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) { }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    audioContextRef.current?.close();
    outputAudioContextRef.current?.close();
  }, []);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white dark:bg-black overflow-hidden relative border-x border-zinc-100 dark:border-zinc-900 shadow-2xl">
      <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-900 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between relative min-h-[80px]">
        <div className="flex flex-col z-10">
          <h1 className="text-xl font-black tracking-tighter uppercase leading-none italic">
            {COMPANY_CONFIG.name}<span className="text-zinc-400">Support</span>
          </h1>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Technical Support Active
          </p>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <img src={COMPANY_CONFIG.logoUrl} alt={`${COMPANY_CONFIG.name} Logo`} className="h-10 sm:h-12 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2 z-10">
          <Button variant="ghost" className="p-2" onClick={() => window.location.reload()}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </Button>
        </div>
      </header>

      <nav className="flex items-center gap-1 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/20 border-b border-zinc-100 dark:border-zinc-900 overflow-x-auto no-scrollbar">
        <Button variant={mode === 'chat' ? 'primary' : 'ghost'} onClick={() => setMode('chat')} className="flex-1 min-w-[100px]">Voice Chat</Button>
        <Button variant={mode === 'kb' ? 'primary' : 'ghost'} onClick={() => setMode('kb')} className="flex-1 min-w-[100px]">Help Desk</Button>
        <Button variant={mode === 'report' ? 'destructive' : 'ghost'} onClick={handleReportNavClick} className="flex-1 min-w-[100px]">Report Issue</Button>
      </nav>

      <main className="flex-1 overflow-y-auto relative flex flex-col">
        {mode === 'chat' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex flex-col justify-center items-center text-center space-y-6 mb-8 mt-4">
                <div className={`relative transition-all duration-700 ${isVoiceActive ? 'scale-110' : 'scale-100'}`}>
                  <div className={`absolute inset-0 bg-zinc-900 dark:bg-zinc-50 rounded-full blur-3xl opacity-20 animate-pulse ${isVoiceActive ? 'scale-150' : 'scale-0'}`}></div>
                  <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 flex items-center justify-center relative z-10 transition-colors duration-500 ${isVoiceActive
                    ? (isMicMuted ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-900 dark:border-zinc-50 bg-zinc-900 dark:bg-zinc-50')
                    : 'border-zinc-200 dark:border-zinc-800'
                    }`}>
                    {isVoiceActive ? (
                      isMicMuted ? (
                        <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" /></svg>
                      ) : (
                        <div className="flex items-end gap-1.5 h-8">
                          {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="w-1 bg-white dark:bg-zinc-950 rounded-full animate-bounce" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }}></div>
                          ))}
                        </div>
                      )
                    ) : (
                      <svg className="w-10 h-10 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  {isVoiceActive && (
                    <Button onClick={() => setIsMicMuted(!isMicMuted)} variant={isMicMuted ? "warning" : "secondary"} className="w-full h-10 text-sm rounded-full flex items-center justify-center gap-2">
                      {isMicMuted ? "Unmute Mic" : "Mute Mic"}
                    </Button>
                  )}
                  <Button onClick={isVoiceActive ? stopVoice : startVoice} variant={isVoiceActive ? "destructive" : "primary"} className="w-full h-10 text-sm rounded-full">
                    {isVoiceActive ? "End Voice Session" : "Start Voice Support"}
                  </Button>
                </div>
              </div>
              {messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-900 bg-white/80 dark:bg-black/80 backdrop-blur-sm">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(inputText); }} className="flex gap-2">
                <Input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type your issue..." className="rounded-full px-4" disabled={isVoiceActive} />
                <Button type="submit" disabled={isVoiceActive || !inputText.trim() || isSending} className="rounded-full w-10 h-10 p-0 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </Button>
              </form>
            </div>
          </div>
        )}

        {mode === 'kb' && (
          <div className="space-y-8 pb-10 p-6">
            <h2 className="text-2xl font-black uppercase tracking-tighter">Knowledge Base</h2>
            <Input placeholder="Search articles..." value={kbSearchQuery} onChange={(e) => setKbSearchQuery(e.target.value)} />
            {filteredKbData.map((category, catIdx) => (
              <div key={catIdx} className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{category.category}</h3>
                <Card className="px-4">
                  {category.articles.map((article, artIdx) => (
                    <AccordionItem key={artIdx} title={article.title} content={article.content} isOpen={kbOpenId === `${catIdx}-${artIdx}`} onClick={() => toggleKb(`${catIdx}-${artIdx}`)} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}

        {mode === 'report' && (
          <div className="space-y-8 p-6">
            <div className="flex items-center justify-between">
              <Badge variant="error">Priority Support</Badge>
              <Button variant="ghost" onClick={() => setMode('chat')}>Close Form</Button>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">Report an Outage</h2>
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-tight">Support Line: {COMPANY_CONFIG.supportNumber} (TEXT ONLY - NO CALLS)</p>
            {reportStatus && <div className="p-4 rounded-lg text-sm font-bold border">{reportStatus.message}</div>}
            <Card className="p-6">
              <form onSubmit={handleReportSubmit} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Request Type</label>
                  <Select name="category" required>
                    <option value="Technical Outage">Technical Outage</option>
                    <option value="Restore Service">Restore Service (Activation/Renewal)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Account Username</label>
                  <Input name="username" placeholder="Username" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Issue Subject</label>
                  <Input name="subject" placeholder="Issue Subject" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Device Model</label>
                  <Input name="device" placeholder="Device Model (e.g. Firestick)" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Detailed Description</label>
                  <TextArea name="description" placeholder="Description of the problem..." required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Attach Image (Screenshot / Proof of Payment)</label>
                  <Input
                    type="file"
                    name="attachment"
                    accept="image/png, image/jpeg"
                    className="cursor-pointer file:cursor-pointer file:font-bold file:uppercase file:text-[10px]"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full h-12" isLoading={isReporting}>Dispatch Technicians</Button>
              </form>
            </Card>
          </div>
        )}
      </main>

      <footer className="p-6 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col items-center gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Powered by {COMPANY_CONFIG.name} Live</p>
        <div className="flex gap-4">
          <a href={`mailto:${COMPANY_CONFIG.supportEmail}`} className="text-[10px] font-bold uppercase">Email Support</a>
          <span className="text-zinc-300">|</span>
          <a href="/" className="text-[10px] font-bold uppercase">Main Site</a>
        </div>
      </footer>
    </div>
  );
}
