import React, { useState, useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import { api } from '../lib/api';

const LOTTIE_URL = 'https://lottie.host/44678017-95e8-4266-b0b2-b1ad83a46675/78ujzT1NH7.json';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isSecurityRefusal?: boolean;
  timestamp: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: "👋 **Vanakkam & Hello! I'm your AlphaXync AI Copilot.**\n\nI have full operational access to answer your questions about students, live fee ledgers, Google Sheets synchronization, and the **Universal Custom Automation Engine**.\n\n*How can I help you today?*",
    timestamp: 'Just now'
  }
];

const SUGGESTED_QUESTIONS = [
  '📊 Live System Status',
  '🤖 How does Custom Automation work?',
  '🏷️ Supported {{variables}} in templates',
  '💰 What is Protected Fee Ledger?',
  '🔄 How does Google Sheets sync work?'
];

export const AdminChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('alphaxync_chat_history') || sessionStorage.getItem('campusflow_chat_history');
      return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
    } catch {
      return INITIAL_MESSAGES;
    }
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const launcherAnimRef = useRef<HTMLDivElement>(null);
  const headerAnimRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save history to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('alphaxync_chat_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Load Lottie Animation for Launcher
  useEffect(() => {
    if (!launcherAnimRef.current) return;
    const anim = lottie.loadAnimation({
      container: launcherAnimRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: LOTTIE_URL
    });

    return () => {
      anim.destroy();
    };
  }, []);

  // Load Lottie Animation for Header when open
  useEffect(() => {
    if (!isOpen || !headerAnimRef.current) return;
    const anim = lottie.loadAnimation({
      container: headerAnimRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: LOTTIE_URL
    });

    return () => {
      anim.destroy();
    };
  }, [isOpen]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await api.askChatbot(query, historyPayload);
      const botReply = res?.reply || "I didn't receive a response. Please try again.";

      const assistantMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: botReply,
        isSecurityRefusal: res?.isSecurityRefusal,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Sorry, I encountered a temporary error: ${err.message || 'Could not reach server'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages(INITIAL_MESSAGES);
    try {
      sessionStorage.removeItem('alphaxync_chat_history');
      sessionStorage.removeItem('campusflow_chat_history');
    } catch {}
  };

  const renderFormattedMarkdown = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Header 3
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="font-bold text-xs text-primary mt-2 mb-1 uppercase tracking-wider">
            {line.replace('### ', '')}
          </h4>
        );
      }
      // Header 2
      if (line.startsWith('## ')) {
        return (
          <h3 key={idx} className="font-bold text-sm text-on-surface mt-2 mb-1">
            {line.replace('## ', '')}
          </h3>
        );
      }
      // Bullet point
      if (line.startsWith('- ') || line.startsWith('• ')) {
        const bulletText = line.replace(/^[-•]\s*/, '');
        return (
          <li key={idx} className="ml-3 text-xs list-disc my-0.5 leading-relaxed">
            {renderInlineSpans(bulletText)}
          </li>
        );
      }
      // Table row (simple preview)
      if (line.startsWith('|')) {
        return (
          <div key={idx} className="font-data-mono text-[10px] bg-surface-container-low px-1 py-0.5 my-0.5 rounded">
            {line}
          </div>
        );
      }
      // Empty line
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      // Regular line
      return (
        <p key={idx} className="text-xs leading-relaxed my-0.5">
          {renderInlineSpans(line)}
        </p>
      );
    });
  };

  const renderInlineSpans = (text: string) => {
    // Bold **text**
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-on-surface">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="font-data-mono text-[11px] bg-surface-container px-1 py-0.2 rounded text-primary">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Animated Lottie Trigger Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 animate-fade-in">
          <button
            onClick={() => setIsOpen(true)}
            className="group relative h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary via-primary/95 to-primary/80 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center border border-white/20 p-1"
            title="Ask AlphaXync AI Copilot"
          >
            {/* Lottie Animation container */}
            <div ref={launcherAnimRef} className="w-full h-full pointer-events-none" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-secondary rounded-full border-2 border-surface animate-pulse" />
          </button>
        </div>
      )}

      {/* Chatbot Window / Drawer */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[95vw] sm:w-[420px] max-h-[85vh] h-[640px] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/35 flex flex-col overflow-hidden animate-slide-up">
          {/* Header with animated bot avatar */}
          <div className="px-4 py-3 bg-surface-container-low/70 border-b border-outline-variant/20 flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center p-0.5 overflow-hidden">
                <div ref={headerAnimRef} className="w-full h-full pointer-events-none" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-on-surface">AlphaXync Copilot</h3>
                  <span className="px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/25 text-primary font-data-mono text-[9px] font-bold uppercase">
                    Beta
                  </span>
                  <span className="w-2 h-2 rounded-full bg-secondary animate-pulse ml-0.5" />
                </div>
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
                  <span>Operational Assistant</span>
                  <span>·</span>
                  <span className="text-secondary font-medium font-data-mono text-[10px]">Live Data Linked</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                className="w-7 h-7 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors"
                title="Clear conversation"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors"
                title="Minimize chatbot"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background/50">
            {messages.map((msg) => {
              const isBot = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[88%] p-3 rounded-2xl shadow-xs ${
                      isBot
                        ? msg.isSecurityRefusal
                          ? 'bg-error-container/20 border border-error/30 text-on-surface rounded-tl-xs'
                          : 'bg-surface-container-low border border-outline-variant/20 text-on-surface rounded-tl-xs'
                        : 'bg-primary text-on-primary rounded-tr-xs shadow-sm'
                    }`}
                  >
                    {isBot && msg.isSecurityRefusal && (
                      <div className="flex items-center gap-1.5 text-error font-bold text-[11px] mb-1">
                        <span className="material-symbols-outlined text-[14px]">shield</span>
                        <span>Security Protection Active</span>
                      </div>
                    )}
                    <div className="text-xs leading-relaxed space-y-1">
                      {isBot ? renderFormattedMarkdown(msg.content) : msg.content}
                    </div>
                  </div>
                  <span className="text-[10px] text-outline mt-1 px-1 font-data-mono">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start">
                <div className="bg-surface-container-low border border-outline-variant/20 p-3 rounded-2xl rounded-tl-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span className="text-xs text-on-surface-variant font-medium">
                    Consulting AlphaXync engine...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick Question Chips */}
          <div className="px-3 py-2 bg-surface-container-lowest border-t border-outline-variant/15 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(q)}
                disabled={isLoading}
                className="whitespace-nowrap text-[11px] bg-surface-container px-2.5 py-1 rounded-full text-on-surface hover:bg-primary/10 hover:text-primary transition-all font-medium border border-outline-variant/20 flex-shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 bg-surface-container-lowest border-t border-outline-variant/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about automations, fees, sync (English or Tamil)..."
                disabled={isLoading}
                className="flex-1 h-9 px-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary font-medium"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="w-9 h-9 rounded-xl bg-primary text-on-primary hover:bg-primary/90 flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-primary shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-outline mt-1.5 px-1">
              <span className="flex items-center gap-1 text-[9.5px]">
                <span className="material-symbols-outlined text-[11px] text-secondary">verified_user</span>
                <span>Protected Copilot · Sensitive API keys confidential</span>
              </span>
              <span className="hidden sm:inline text-[9.5px]">Powered by AlphaXync</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
