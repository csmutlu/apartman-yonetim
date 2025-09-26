import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "./AIChatBot.css";
import {
  FaRobot,
  FaRegCommentDots,
  FaTimes,
  FaPaperPlane,
  FaVolumeMute,
  FaVolumeUp,
  FaTrashAlt,
  FaCopy,
  FaInfoCircle,
  FaRegLightbulb,
} from "react-icons/fa";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";

const AIChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatHistoryRef = useRef([]);
  const location = useLocation();
  const [visitedPages, setVisitedPages] = useState({});

  const [suggestions, setSuggestions] = useState([
    "Aidat ödeme durumumu nasıl görebilirim?",
    "Apartman giderleri hakkında bilgi alabilir miyim?",
    "Bina yönetimine nasıl ulaşabilirim?",
    "Arıza bildirimi nasıl yapılır?",
  ]);

  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "YAPAY_ZEKA_API_KEY";

  const genAI = new GoogleGenerativeAI(API_KEY);

  useEffect(() => {
    const captureContent = setTimeout(() => {
      try {
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
          setVisitedPages((prev) => ({
            ...prev,
            [location.pathname]: {
              title: document.title,
              content: mainContent.innerText,
              timestamp: new Date().toISOString(),
            },
          }));
        }
      } catch (error) {
        console.error("Sayfa içeriği alınamadı:", error);
      }
    }, 1000);

    return () => clearTimeout(captureContent);
  }, [location.pathname]);

  const toggleChatbot = () => {
    setIsOpen(!isOpen);
    if (!isOpen && soundEnabled) {
      playSound("open");
    }
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const playSound = (type) => {
    if (!soundEnabled) return;

    const sounds = {
      open: new Audio("/sounds/chat-open.mp3"),
      message: new Audio("/sounds/message-sent.mp3"),
      notification: new Audio("/sounds/notification.mp3"),
    };

    const sound = sounds[type];
    if (sound) {
      sound.volume = 0.3;
      sound.play().catch((e) => console.log("Ses çalma hatası:", e));
    }
  };

  const clearChat = () => {
    setMessages([]);
    chatHistoryRef.current = [];
    if (soundEnabled) {
      playSound("notification");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      const copyBtn = document.getElementById("aichat-copy-btn");
      if (copyBtn) {
        copyBtn.classList.add("aichat-copied");
        setTimeout(() => {
          copyBtn.classList.remove("aichat-copied");
        }, 2000);
      }
    });
  };

  const sendSuggestion = (suggestion) => {
    setInput(suggestion);
    handleSubmit({ preventDefault: () => {} });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const collectPageContent = () => {
    try {
      let mainContentText = "";
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContentText = mainContent.innerText;
      }

      let specificContent = "";
      const currentPath = location.pathname;

      if (currentPath.includes("/admin/home") || currentPath === "/admin") {
        const statsElements = document.querySelectorAll(
          ".stats-grid .stat-card"
        );
        const cashStatus = document.querySelector(".cash-status-card");

        if (statsElements && statsElements.length) {
          specificContent += "\nYönetici Dashboard İstatistikleri:\n";
          statsElements.forEach((el) => {
            specificContent += el.innerText.replace(/\n+/g, " - ") + "\n";
          });
        }

        if (cashStatus) {
          specificContent +=
            "\nKasa Durumu:\n" +
            cashStatus.innerText.replace(/\n+/g, " - ") +
            "\n";
        }
      }

      if (currentPath.includes("/user/home") || currentPath === "/user") {
        const welcomeSection = document.querySelector(".welcome-section");
        const debtCard = document.querySelector(".debt-section");

        if (welcomeSection) {
          specificContent +=
            "\nKullanıcı Hoşgeldin Bilgisi:\n" +
            welcomeSection.innerText.replace(/\n+/g, " - ") +
            "\n";
        }

        if (debtCard) {
          specificContent +=
            "\nBorç Durumu:\n" +
            debtCard.innerText.replace(/\n+/g, " - ") +
            "\n";
        }
      }

      return {
        currentPage: {
          path: currentPath,
          title: document.title || "Apartman Yönetim",
          content: mainContentText + specificContent,
        },
        allPages: Object.entries(visitedPages).map(([path, content]) => ({
          path,
          title: content.title || path,
          contentSummary: content.content?.substring(0, 500) + "...",
        })),
      };
    } catch (error) {
      console.error("İçerik toplama hatası:", error);
      return {
        currentPage: { path: location.pathname, content: "" },
        allPages: [],
      };
    }
  };
  const getGeminiResponse = async (prompt, pageInfo) => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const chatHistory = chatHistoryRef.current;

      const contextWithPageInfo = `
${prompt}

MEVCUT SAYFA BİLGİSİ:
Şu anda görüntülenen sayfa: ${pageInfo.currentPage.path}
Sayfa başlığı: ${pageInfo.currentPage.title || "Apartman Yönetim"}

SAYFA İÇERİĞİ:
${pageInfo.currentPage.content}

ERİŞİLEBİLİR DİĞER SAYFALAR:
${pageInfo.allPages.map((p) => `- ${p.path} (${p.title})`).join("\n")}
`;

      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      });

      const result = await chat.sendMessage(contextWithPageInfo);
      const response = result.response.text();

      chatHistoryRef.current = [
        ...chatHistory,
        { role: "user", parts: [{ text: prompt }] },
        { role: "model", parts: [{ text: response }] },
      ];

      return response;
    } catch (error) {
      console.error("Gemini API hatası:", error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userInput = input;

    const userMessage = {
      text: userInput,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    if (soundEnabled) {
      playSound("message");
    }

    try {
      const pageInfo = collectPageContent();

      const systemContext =
        "Sen bir apartman yönetim uygulaması için AI asistansın. " +
        "Sana verilen sayfa içeriğini analiz edip kullanıcının sorusuna yanıt vermelisin. " +
        "Kullanıcı mevcut sayfadaki veya diğer sayfalardaki bilgilerle ilgili sorular sorabilir. " +
        "Sayfa içeriğinde bulunan verileri kullanarak yanıt oluştur. " +
        "Eğer bilgi sayfada bulunmuyorsa, genel apartman yönetim bilgilerini kullanabilirsin. " +
        "Bilgilendirici, kibar ve yardımsever ol.";

      const fullPrompt = `${systemContext}\n\nKullanıcı sorusu: ${userInput}`;
      const aiResponseText = await getGeminiResponse(fullPrompt, pageInfo);

      const aiMessage = {
        text: aiResponseText || "Üzgünüm, bir cevap alamadım.",
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      if (soundEnabled) {
        playSound("notification");
      }
    } catch (error) {
      console.error("Chatbot hatası:", error);
      setMessages((prev) => [
        ...prev,
        {
          text:
            "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin. Hata detayı: " +
            error.message,
          sender: "ai",
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const currentPath = location.pathname;
    if (currentPath.includes("/user/payments")) {
      setSuggestions([
        "Ödememi nasıl yapabilirim?",
        "Son ödeme tarihi ne zaman?",
        "Neden ödeme yapmam gerekiyor?",
        "Ödeme geçmişimi nasıl görebilirim?",
      ]);
    } else if (currentPath.includes("/user/issues")) {
      setSuggestions([
        "Nasıl arıza bildirebilirim?",
        "Arıza talebimin durumunu nasıl takip edebilirim?",
        "Ne tür arızalar için bildirim yapabilirim?",
        "Arıza bildirimi için gerekli bilgiler nelerdir?",
      ]);
    } else if (currentPath.includes("/admin")) {
      setSuggestions([
        "Bu sayfadaki kasa durumu nedir?",
        "Bekleyen arızalar kaç tane?",
        "Toplam borç miktarı nedir?",
        "Nasıl yeni duyuru ekleyebilirim?",
      ]);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="aichat-container">
      {isOpen && (
        <div className="aichat-window">
          <div className="aichat-header">
            <div className="aichat-title">
              <FaRobot className="aichat-icon" />
              <h3>Apartman Asistanı</h3>
            </div>
            <div className="aichat-actions">
              <button
                className="aichat-action-button"
                onClick={toggleSound}
                aria-label={soundEnabled ? "Sesi kapat" : "Sesi aç"}
                title={soundEnabled ? "Sesi kapat" : "Sesi aç"}
              >
                {soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              </button>
              <button
                className="aichat-action-button"
                onClick={clearChat}
                aria-label="Sohbeti temizle"
                title="Sohbeti temizle"
              >
                <FaTrashAlt />
              </button>
              <button
                className="aichat-close-button"
                onClick={toggleChatbot}
                aria-label="Chatbot'u kapat"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="aichat-messages">
            {messages.length === 0 && (
              <>
                <div className="aichat-message aichat-ai aichat-welcome">
                  <div className="aichat-message-content">
                    <div className="aichat-message-bubble">
                      <div className="aichat-message-text">
                        <p>
                          Merhaba! Ben <strong>Apartman Asistanınız</strong>.
                        </p>
                        <p>
                          Apartman hakkında veya şu anda görüntülediğiniz
                          sayfadaki içerik hakkında sorularınızı
                          yanıtlayabilirim.
                        </p>
                        <p className="aichat-tip">
                          <FaInfoCircle /> İpucu: Aşağıdaki soruları
                          deneyebilirsiniz veya kendi sorunuzu yazabilirsiniz.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="aichat-suggestions">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      className="aichat-suggestion"
                      onClick={() => sendSuggestion(suggestion)}
                    >
                      <FaRegLightbulb className="aichat-suggestion-icon" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`aichat-message aichat-${msg.sender} ${
                  msg.isError ? "aichat-error" : ""
                }`}
              >
                <div className="aichat-message-content">
                  <div className="aichat-message-bubble">
                    <div className="aichat-message-text">
                      {msg.sender === "ai" ? (
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      ) : (
                        msg.text
                      )}
                    </div>
                    <div className="aichat-message-footer">
                      <span className="aichat-message-time">
                        {formatTime(msg.timestamp)}
                      </span>
                      {msg.sender === "ai" && (
                        <button
                          id="aichat-copy-btn"
                          className="aichat-copy-button"
                          onClick={() => copyToClipboard(msg.text)}
                          title="Mesajı kopyala"
                        >
                          <FaCopy />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="aichat-message aichat-ai">
                <div className="aichat-message-content">
                  <div className="aichat-message-bubble">
                    <div className="aichat-message-text aichat-typing">
                      <span className="aichat-dot"></span>
                      <span className="aichat-dot"></span>
                      <span className="aichat-dot"></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="aichat-input-form">
            <input
              type="text"
              className="aichat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bu sayfayla ilgili bir soru sorun..."
              disabled={isLoading}
              ref={inputRef}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="aichat-send-button"
              aria-label="Mesaj gönder"
            >
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}

      <button
        className={`aichat-toggle ${isOpen ? "aichat-open" : ""}`}
        onClick={toggleChatbot}
        aria-label={isOpen ? "Chatbot'u kapat" : "Chatbot'u aç"}
      >
        {isOpen ? <FaTimes /> : <FaRegCommentDots />}
        <span>{isOpen ? "Kapat" : "Soru Sor"}</span>
      </button>
    </div>
  );
};

export default AIChatBot;
