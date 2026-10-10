import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { analyzeTextDocument, applyReaderCommand, getSpeechServiceHealth, synthesizeSpeech, transcribeSpeech } from "./services/textAnalysis.js";
import SmartQuickActions from "./components/SmartQuickActions.jsx";

const sample = {
  name: "A short guide to climate change",
  text: `Earth is getting warmer. This is called climate change. Burning coal, oil and gas adds heat-trapping gases to the air. These gases act like a blanket around Earth.

A warmer planet changes weather patterns. Some places have longer heat waves. Other places have heavier rain or longer dry spells. These changes can affect crops, animals and people.

Clean energy comes from sources like sunlight and wind. Using clean energy can reduce the gases that warm our planet. Saving energy and protecting trees can also help. People, communities and governments all have a part to play.`,
  translations: {
    English: {
      title: "A short guide to climate change",
      simple:
        "Earth is getting warmer. People burning coal, oil and gas is a major reason. This can change the weather and affect people, animals and crops. Using energy from sunlight and wind can help.",
      balanced:
        "Earth is getting warmer. This is called climate change. Burning coal, oil and gas adds heat-trapping gases to the air. This changes weather and can affect people, animals and crops. Clean energy from sunlight and wind can help reduce these gases.",
      detailed:
        "Earth is getting warmer, a change known as climate change. Burning coal, oil and gas adds heat-trapping gases to the atmosphere, where they act like a blanket. A warmer planet can mean longer heat waves, heavier rain and longer dry spells. These weather changes affect crops, animals and people. Energy from sunlight and wind, together with saving energy and protecting trees, can reduce warming. Individuals, communities and governments all play a part.",
      points: [
        "Burning coal, oil and gas adds heat-trapping gases to the air.",
        "A warmer planet can change weather and affect people, animals and crops.",
        "Clean energy, saving energy and protecting trees can help.",
      ],
    },
    Spanish: {
      title: "Una guía breve sobre el cambio climático",
      simple:
        "La Tierra se está calentando. Quemar carbón, petróleo y gas es una de las principales razones. Esto puede cambiar el clima y afectar a las personas, los animales y los cultivos. La energía del sol y del viento puede ayudar.",
      balanced:
        "La Tierra se está calentando. A esto se le llama cambio climático. Quemar carbón, petróleo y gas añade gases que atrapan el calor en el aire. Esto cambia el clima y puede afectar a las personas, los animales y los cultivos. La energía limpia del sol y del viento puede ayudar a reducir estos gases.",
      detailed:
        "La Tierra se está calentando, un cambio conocido como cambio climático. Quemar carbón, petróleo y gas añade a la atmósfera gases que atrapan el calor, donde actúan como una manta. Un planeta más cálido puede provocar olas de calor más largas, lluvias más intensas y períodos secos más prolongados. Estos cambios climáticos afectan a los cultivos, los animales y las personas. La energía del sol y del viento, junto con el ahorro de energía y la protección de los árboles, puede reducir el calentamiento. Las personas, las comunidades y los gobiernos tienen un papel importante.",
      points: [
        "Quemar carbón, petróleo y gas añade gases que atrapan el calor.",
        "Un planeta más cálido puede cambiar el clima y afectar a personas, animales y cultivos.",
        "La energía limpia, el ahorro de energía y la protección de los árboles pueden ayudar.",
      ],
    },
    Hindi: {
      title: "जलवायु परिवर्तन के बारे में एक छोटी-सी गाइड",
      simple:
        "धरती गर्म हो रही है। कोयला, तेल और गैस जलाना इसका एक बड़ा कारण है। इससे मौसम बदल सकता है और लोगों, जानवरों तथा फसलों पर असर पड़ सकता है। सूरज और हवा से मिलने वाली ऊर्जा मदद कर सकती है।",
      balanced:
        "धरती गर्म हो रही है। इसे जलवायु परिवर्तन कहते हैं। कोयला, तेल और गैस जलाने से हवा में गर्मी रोकने वाली गैसें बढ़ती हैं। इससे मौसम बदलता है और लोगों, जानवरों तथा फसलों पर असर पड़ सकता है। सूरज और हवा से मिलने वाली स्वच्छ ऊर्जा इन गैसों को कम करने में मदद कर सकती है।",
      detailed:
        "धरती गर्म हो रही है। इस बदलाव को जलवायु परिवर्तन कहते हैं। कोयला, तेल और गैस जलाने से वातावरण में ऐसी गैसें बढ़ती हैं जो गर्मी को रोकती हैं। गर्म होती धरती पर लंबे समय तक लू चल सकती है, तेज़ बारिश हो सकती है और सूखे का समय बढ़ सकता है। मौसम के इन बदलावों का असर फसलों, जानवरों और लोगों पर पड़ता है। सूरज और हवा से मिलने वाली ऊर्जा, ऊर्जा की बचत और पेड़ों की रक्षा गर्मी बढ़ने से रोकने में मदद कर सकती है। इसमें लोगों, समुदायों और सरकारों—सबकी भूमिका है।",
      points: [
        "कोयला, तेल और गैस जलाने से हवा में गर्मी रोकने वाली गैसें बढ़ती हैं।",
        "धरती गर्म होने पर मौसम बदल सकता है और लोगों, जानवरों तथा फसलों पर असर पड़ता है।",
        "स्वच्छ ऊर्जा, ऊर्जा की बचत और पेड़ों की रक्षा मदद कर सकती है।",
      ],
    },
  },
};

const assistantGreeting = {
  role: "assistant",
  text: "Hi! I’m your UniRead helper. Ask me how to use the reader or about the document you’re viewing.",
};

const ACTION_FEEDBACK_STORAGE_KEY = "uniread.action-feedback";

const supportedDocumentExtensions = new Set([".txt", ".docx", ".pptx", ".pdf"]);

function getDocumentExtension(fileName) {
  return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
}

async function readDocumentText(file) {
  const extension = getDocumentExtension(file.name);
  if (!supportedDocumentExtensions.has(extension)) {
    throw new Error("Supported formats are TXT, DOCX, PPTX, and PDF. Save older DOC/PPT files as DOCX/PPTX first.");
  }
  if (extension === ".txt") return file.text();

  const { parseOffice } = await import("officeparser/slim");
  const document = await parseOffice(file, { pdfWorkerSrc: pdfWorkerUrl });
  const extracted = await document.to("text");
  return extracted.value.trim();
}

function getDocumentExplanationSteps(text) {
  const paragraphs = text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const sentences = paragraphs.flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/).filter(Boolean));
  const ideas = sentences.length ? sentences : paragraphs;
  const groups = [[], [], []];

  ideas.forEach((idea, index) => groups[Math.min(index, 2)].push(idea));
  return groups.map((group, index) => group.join(" ") || `This document has no separate point ${index + 1} to explain yet.`);
}

function getPictureIcon(icon) {
  const iconProps = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2.2 };
  switch (icon) {
    case "earth":
      return <g {...iconProps}><circle cx="0" cy="0" r="17" /><path d="M-16-5h32M-16 5h32M0-17c-8 9-8 25 0 34M0-17c8 9 8 25 0 34" /></g>;
    case "sun":
      return <g {...iconProps}><circle cx="0" cy="0" r="8" /><path d="M0-19v5m0 28v5m19-19h-5m-28 0h-5m32.4-13.4-3.5 3.5m-19.8 19.8-3.5 3.5m26.8 0-3.5-3.5m-19.8-19.8-3.5-3.5" /></g>;
    case "leaf":
      return <g {...iconProps}><path d="M17-17C2-18-14-12-15 0c-1 9 8 15 16 10 9-5 14-18 16-27Z" /><path d="M-12 13 10-9" /></g>;
    case "people":
      return <g {...iconProps}><circle cx="-7" cy="-7" r="5" /><circle cx="8" cy="-6" r="4" /><path d="M-17 15c0-8 4-12 10-12s10 4 10 12m0-10c7-2 13 2 13 10" /></g>;
    case "factory":
      return <g {...iconProps}><path d="M-17 15V-2l11 7v-7L6 5V-15h7v8h5v22Z" /><path d="M-10 10h3m5 0h3m5 0h3" /></g>;
    case "water":
      return <g {...iconProps}><path d="M0-19C-4-10-15 0-15 8a15 15 0 0 0 30 0C15 0 4-10 0-19Z" /><path d="M-7 8a7 7 0 0 0 7 7" /></g>;
    case "book":
      return <g {...iconProps}><path d="M0-12c-5-5-12-5-18-3v29c7-2 13-2 18 3m0-29c5-5 12-5 18-3v29c-7-2-13-2-18 3Zm0 0v29" /></g>;
    case "brain":
      return <g {...iconProps}><path d="M0-15a7 7 0 0 0-13-2 7 7 0 0 0-4 12 8 8 0 0 0 3 13 7 7 0 0 0 14 1m0-24a7 7 0 0 1 13-2 7 7 0 0 1 4 12 8 8 0 0 1-3 13 7 7 0 0 1-14 1Zm0-2v30m-9-21 5 4m13-4-5 4m-12 8 6-2m12 2-6-2" /></g>;
    case "heart":
      return <path {...iconProps} d="M0 16S-18 5-18-6a9 9 0 0 1 18-3 9 9 0 0 1 18 3C18 5 0 16 0 16Z" />;
    case "chart":
      return <g {...iconProps}><path d="M-17 16h34M-13 12V1h7v11m3 0v-20h7v20m3 0V-1h7v13" /></g>;
    case "shield":
      return <g {...iconProps}><path d="M0-18 16-12v10C16 8 8 15 0 19-8 15-16 8-16-2v-10Z" /><path d="m-7 0 5 5 10-11" /></g>;
    case "bulb":
      return <g {...iconProps}><path d="M-10-3a10 10 0 1 1 20 0c0 5-5 7-6 12h-8c-1-5-6-7-6-12Zm5 17h10m-8 5h6" /></g>;
    case "computer":
      return <g {...iconProps}><rect x="-17" y="-14" width="34" height="24" rx="3" /><path d="M-7 17h14m-7-7v7" /></g>;
    case "molecule":
      return <g {...iconProps}><path d="m-11-7 11-6 11 6v13L0 12l-11-6Z" /><circle cx="-11" cy="-7" r="4" /><circle cx="0" cy="-13" r="4" /><circle cx="11" cy="-7" r="4" /><circle cx="11" cy="6" r="4" /><circle cx="0" cy="12" r="4" /><circle cx="-11" cy="6" r="4" /></g>;
    case "mountain":
      return <g {...iconProps}><path d="m-19 13 12-23 8 14 5-8 13 17Z" /><path d="m-10-4 3 4 3-2m9 0 3 4 3-2" /></g>;
    case "home":
      return <g {...iconProps}><path d="m-18-2 18-15L18-2M-13-5v21h26V-5m-10 21V4h-6v12" /></g>;
    default:
      return <g {...iconProps}><circle cx="0" cy="0" r="16" /><path d="m0-10 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /></g>;
  }
}

function wrapPictureCaption(text, maxLength = 27) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  let wordIndex = 0;
  for (; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
    if (lines.length === 3) break;
  }
  if (line && lines.length < 3) lines.push(line);
  if (wordIndex < words.length - 1 && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  }
  return lines;
}

function PictorialDocumentScene({ scene, documentName, level }) {
  return (
    <svg
      className="picture-scene"
      viewBox="0 0 720 280"
      role="img"
      aria-label={`${scene.title}. ${scene.nodes.map((node, index) => `Part ${index + 1}: ${node.label}. ${node.caption}`).join(" ")}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{scene.title} — {documentName} ({level} view)</title>
      <defs>
        <linearGradient id="scene-background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f8ef" />
          <stop offset="1" stopColor="#e8f2eb" />
        </linearGradient>
        <marker id="scene-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10Z" fill="#80a88a" />
        </marker>
      </defs>
      <rect x="1" y="1" width="718" height="278" rx="18" fill="url(#scene-background)" stroke="#dce9dc" />
      <text x="24" y="31" fill="#315a40" fontSize="16" fontWeight="700">{scene.title}</text>
      {scene.nodes.map((node, index) => {
        const x = 20 + index * 232;
        const captionLines = wrapPictureCaption(node.caption);
        return (
          <g key={`${node.icon}-${node.label}-${index}`}>
            {index < 2 && (
              <path d={`M${x + 204} 144h20`} fill="none" stroke="#80a88a" strokeWidth="3" markerEnd="url(#scene-arrow)" />
            )}
            <rect x={x} y="48" width="204" height="208" rx="15" fill="#fff" stroke="#d9e6d8" />
            <circle cx={x + 102} cy="111" r="35" fill={["#dff0dd", "#e2edf8", "#f9ecd3"][index]} />
            <g transform={`translate(${x + 102} 111)`} color={["#39734f", "#3f6f9c", "#a06e2f"][index]}>
              {getPictureIcon(node.icon)}
            </g>
            <text x={x + 102} y="166" textAnchor="middle" fill="#294b35" fontSize="14" fontWeight="700">
              {node.label}
            </text>
            {captionLines.map((line, lineIndex) => (
              <text key={`${line}-${lineIndex}`} x={x + 102} y={190 + lineIndex * 16} textAnchor="middle" fill="#5b6c60" fontSize="11">
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const icons = {
  book: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5.5c2.8-.9 5-.4 7 1.3v12c-2-1.7-4.2-2.2-7-1.3v-12Zm14 0c-2.8-.9-5-.4-7 1.3v12c2-1.7 4.2-2.2-7-1.3v-12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 9h1.5M8 12h1.5m6-3H17m-1.5 3H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.8h7l5 5v11.4H6V3.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 4v5h5M9 13h6m-6 3h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  contrast: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" />
    </svg>
  ),
  question: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-1 .8-1.6 1.2-1.6 2.6m0 3v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s8-4 8-11V5l-8-3-8 3v5c0 7 8 11 8 11Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function Brand({ mobile = false }) {
  return (
    <a className={`brand${mobile ? " mobile-brand" : ""}`} href="#workspace" aria-label="UniRead AI home">
      <span className="brand-mark">{icons.book}</span>
      UniRead <span className="brand-ai">AI</span>
    </a>
  );
}

function ActionFeedback({ feedback, onChange, onSubmit }) {
  if (!feedback) return null;

  return (
    <form className="action-feedback" onSubmit={onSubmit} aria-labelledby="action-feedback-title">
      {feedback.submitted ? (
        <p className="action-feedback-thanks" role="status">Thanks for helping improve “{feedback.action}”.</p>
      ) : (
        <>
          <div className="action-feedback-heading">
            <strong id="action-feedback-title">Was “{feedback.action}” helpful?</strong>
            <span>Your feedback is saved on this device.</span>
          </div>
          <div className="action-feedback-rating" role="group" aria-label="Rate this action">
            <button
              type="button"
              aria-pressed={feedback.rating === "helpful"}
              onClick={() => onChange({ ...feedback, rating: "helpful" })}
            >Yes, helpful</button>
            <button
              type="button"
              aria-pressed={feedback.rating === "not-helpful"}
              onClick={() => onChange({ ...feedback, rating: "not-helpful" })}
            >Not quite</button>
          </div>
          {feedback.rating && (
            <div className="action-feedback-comment">
              <label htmlFor="action-feedback-comment">Anything we could improve? <span>(optional)</span></label>
              <textarea
                id="action-feedback-comment"
                value={feedback.comment}
                maxLength={500}
                rows={2}
                onChange={(event) => onChange({ ...feedback, comment: event.target.value })}
              />
              <button className="action-feedback-submit" type="submit">Send feedback</button>
            </div>
          )}
        </>
      )}
    </form>
  );
}

function App() {
  const [text, setText] = useState(sample.text);
  const [title, setTitle] = useState(sample.name);
  const [manualText, setManualText] = useState("");
  const [isSample, setIsSample] = useState(true);
  const [hasUploadedDocument, setHasUploadedDocument] = useState(false);
  const [readerAnalysis, setReaderAnalysis] = useState(null);
  const [isAnalyzingReader, setIsAnalyzingReader] = useState(false);
  const [isApplyingReaderCommand, setIsApplyingReaderCommand] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isAnalyzedByModel, setIsAnalyzedByModel] = useState(false);
  const [isReaderTextModified, setIsReaderTextModified] = useState(false);
  const [quickActionResult, setQuickActionResult] = useState(null);
  const [level, setLevel] = useState("balanced");
  const [view, setView] = useState("overview");
  const [language, setLanguage] = useState("English");
  const [outputCustomizationOpen, setOutputCustomizationOpen] = useState(false);
  const [pictureExplanationOpen, setPictureExplanationOpen] = useState(false);
  const [outputLineLimit, setOutputLineLimit] = useState("none");
  const [outputFont, setOutputFont] = useState("sans");
  const [translateOpen, setTranslateOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [wideSpacing, setWideSpacing] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const [voice, setVoice] = useState("female");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStartingCapture, setIsStartingCapture] = useState(false);
  const [recognitionLanguages, setRecognitionLanguages] = useState([]);
  const [recognitionLanguage, setRecognitionLanguage] = useState("English");
  const [isSpeechConfigured, setIsSpeechConfigured] = useState(false);
  const [isLoadingSpeechHealth, setIsLoadingSpeechHealth] = useState(true);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([assistantGreeting]);
  const [voiceCommandInput, setVoiceCommandInput] = useState("");
  const [documentDraft, setDocumentDraft] = useState("");
  const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false);
  const [chatFileName, setChatFileName] = useState("");
  const [documentChatOpen, setDocumentChatOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [documentChats, setDocumentChats] = useState([{ id: "document-welcome", title: "New document chat", messages: [] }]);
  const [activeDocumentChatId, setActiveDocumentChatId] = useState("document-welcome");
  const fileInput = useRef(null);
  const chatFileInput = useRef(null);
  const readerAnalysisRef = useRef(null);
  const speechAudioRef = useRef(null);
  const speechObjectUrlRef = useRef(null);
  const speechRequestRef = useRef(null);
  const captureStartingRef = useRef(false);
  const recordingRef = useRef(null);
  const assistantMessagesRef = useRef(null);
  const documentMessagesRef = useRef(null);
  const toastTimer = useRef(null);
  const lastToastRef = useRef({ key: "", timestamp: 0 });

  const activeDocumentChat = documentChats.find((chat) => chat.id === activeDocumentChatId) ?? documentChats[0];
  const translated = sample.translations[language];
  const canTranslate = isSample && Boolean(translated);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const activeText = canTranslate
    ? translated[level]
    : readerAnalysis?.readingLevels?.[level]
      ?? (level === "simple"
        ? sentences.slice(0, 2).join(" ")
        : level === "balanced"
          ? sentences.slice(0, 4).join(" ")
          : text);
  const documentName = canTranslate ? translated.title : title;
  const explanationSteps = readerAnalysis?.explanationSteps?.[level] ?? getDocumentExplanationSteps(activeText);
  const outputContentClass = `output-content font-${outputFont}${outputLineLimit !== "none" ? " limited-output" : ""}`;
  const outputContentStyle = {
    fontSize: `${fontSize}px`,
    "--output-line-limit": outputLineLimit,
  };
  const pictureExplanation = readerAnalysis?.pictureExplanations?.[level]
    || activeText
    || "Add document text to generate a picture explanation.";
  const pictureScene = readerAnalysis?.pictureScenes?.[level] ?? {
    title: `A picture of ${documentName}`,
    nodes: explanationSteps.map((step, index) => ({
      icon: ["book", "brain", "bulb"][index],
      label: `Step ${index + 1}`,
      caption: step,
    })),
  };
  const points = canTranslate
    ? translated.points
    : sentences.slice(0, level === "simple" ? 2 : level === "balanced" ? 4 : 8);
  const outputLabel =
    view === "points"
      ? "The main ideas"
      : view === "original"
        ? "Full document text"
        : `${level[0].toUpperCase() + level.slice(1)} explanation`;
  const previewNote = isReaderTextModified
    ? "Document updated by your model command."
    : !isSample && language !== "English"
      ? "Translation is not connected for uploaded documents. Showing your original text."
      : isSample && language !== "English"
        ? "Sample translation preview. Uploaded documents are not translated in this demo."
        : isSample
          ? "Interactive sample. Simplification and translation are previews, not AI-processed results."
          : isAnalyzedByModel
            ? "AI analysis generated by your configured provider."
            : "Your text is read in this browser. Simplification is a basic preview, not an AI result.";

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    speechRequestRef.current?.abort();
    speechAudioRef.current?.pause();
    if (speechObjectUrlRef.current) URL.revokeObjectURL(speechObjectUrlRef.current);
    const recording = recordingRef.current;
    if (recording?.recorder.state !== "inactive") recording?.recorder.stop();
    recording?.stream.getTracks().forEach((track) => track.stop());
    recording?.audioContext?.close();
    recording?.transcriptionRequest?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    getSpeechServiceHealth({ signal: controller.signal })
      .then(({ recognitionLanguages: installedLanguages, speechConfigured }) => {
        if (!mounted) return;
        setIsSpeechConfigured(speechConfigured);
        setRecognitionLanguages(installedLanguages);
        if (installedLanguages.length > 0 && !installedLanguages.includes(recognitionLanguage)) {
          setRecognitionLanguage(installedLanguages[0]);
        }
      })
      .catch((error) => {
        if (mounted && !(error instanceof Error && error.name === "AbortError")) {
          setRecognitionLanguages([]);
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingSpeechHealth(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    assistantMessagesRef.current?.scrollTo({
      top: assistantMessagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [assistantMessages, assistantOpen]);

  useEffect(() => {
    documentMessagesRef.current?.scrollTo({
      top: documentMessagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeDocumentChat?.messages, activeDocumentChatId]);

  function showToast(message, type = "info") {
    const key = `${type}:${message}`;
    const now = Date.now();
    if (lastToastRef.current.key === key && now - lastToastRef.current.timestamp < 1200) return;
    lastToastRef.current = { key, timestamp: now };
    const id = now;
    setToast({ id, message, type });
    window.clearTimeout(toastTimer.current);
    if (type !== "loading") {
      toastTimer.current = window.setTimeout(
        () => setToast((current) => current?.id === id ? null : current),
        type === "error" ? 8500 : 4500,
      );
    }
  }

  async function chooseFile(file) {
    if (!file || isAnalyzingReader || isReadingFile) return;
    setIsReadingFile(true);
    showToast(`Opening ${file.name} and extracting its text…`, "loading");
    try {
      const content = (await readDocumentText(file)).trim();
      if (!content) {
        showToast(
          getDocumentExtension(file.name) === ".pdf"
            ? "No selectable text was found in this PDF. Scanned PDFs need OCR and are not supported yet."
            : "This file has no readable text. Choose another document.",
          "error",
        );
        return;
      }
      setText(content);
      setTitle(file.name);
      setIsSample(false);
      setHasUploadedDocument(true);
      setReaderAnalysis(null);
      setQuickActionResult(null);
      setIsAnalyzedByModel(false);
      setIsReaderTextModified(false);
      setLanguage("English");
      setLevel("balanced");
      setView("overview");
      showToast(`${file.name} is ready. Choose Analyze document or a quick action.`, "success");
    } catch (error) {
      showToast(`Couldn't open ${file.name}: ${error instanceof Error ? error.message : "Please try another file."} Check the file format and try another document.`, "error");
    } finally {
      setIsReadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openSample() {
    setText(sample.text);
    setTitle(sample.name);
    setIsSample(true);
    setHasUploadedDocument(false);
    setReaderAnalysis(null);
    setQuickActionResult(null);
    setIsAnalyzedByModel(false);
    setIsReaderTextModified(false);
    setLanguage("English");
    setLevel("balanced");
    setView("overview");
    if (fileInput.current) fileInput.current.value = "";
    document.querySelector(".reader-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Sample document opened. Try changing the reading level or view.");
  }

  function useManualText() {
    if (isAnalyzingReader) {
      showToast("Wait for the current document analysis to finish before changing the reader text.");
      return;
    }
    const content = manualText.trim();
    if (!content) {
      showToast("Enter some text before opening it in the reader.");
      return;
    }
    setText(content);
    setTitle("Pasted text");
    setIsSample(false);
    setHasUploadedDocument(false);
    setReaderAnalysis(null);
    setQuickActionResult(null);
    setIsAnalyzedByModel(false);
    setIsReaderTextModified(false);
    setLanguage("English");
    setLevel("balanced");
    setView("overview");
    showToast("Your text is ready in the reader.");
    window.setTimeout(() => {
      document.querySelector(".reader-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function analyzeReaderDocument() {
    if (!text.trim()) {
      showToast("Add a document before asking for an analysis.");
      return;
    }
    setIsAnalyzingReader(true);
    setReaderAnalysis(null);
    setQuickActionResult(null);
    showToast("Analyzing your document…", "loading");
    try {
      const result = await analyzeTextDocument({
        text,
        title,
        readingLevel: level,
        language,
      });
      setReaderAnalysis(result.analysis);
      setActionFeedback({ action: "Document analysis", rating: null, comment: "", submitted: false });
      showToast(`Analysis complete${result.model ? ` using ${result.model}` : ""}.`, "success");
      window.setTimeout(() => {
        readerAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : "Text analysis failed."} Check that the analysis backend and API key are configured, then try again.`, "error");
    } finally {
      setIsAnalyzingReader(false);
    }
  }

  async function changeReadingLevel(nextLevel) {
    setLevel(nextLevel);
    if (isSample || readerAnalysis?.readingLevels || isAnalyzingReader || !text.trim()) return;

    setIsAnalyzingReader(true);
    showToast(`Preparing distinct ${nextLevel} explanations…`, "loading");
    try {
      const result = await analyzeTextDocument({
        text,
        title,
        readingLevel: nextLevel,
        language,
      });
      setReaderAnalysis(result.analysis);
      setIsAnalyzedByModel(true);
      showToast("Simple, balanced, and detailed explanations are ready.", "success");
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : "Could not generate the reading levels."} Your current document text is unchanged.`, "error");
    } finally {
      setIsAnalyzingReader(false);
    }
  }

  async function runQuickAction(actionId) {
    const action = {
      "read-aloud": "Read aloud",
      simplify: "Simplify text",
      "translate-telugu": "Translate to Telugu",
      summarize: "Summarize",
      "mind-map": "Generate mind map",
    }[actionId];
    if (!action) return false;
    if (!text.trim()) {
      showToast("Add or paste a document before running a quick action.", "error");
      return false;
    }

    if (actionId === "read-aloud") {
      return (await toggleSpeech()) !== false;
    }

    const readingLevel = actionId === "simplify" ? "simple" : level;
    const targetLanguage = actionId === "translate-telugu" ? "Telugu" : language;
    setIsAnalyzingReader(true);
    showToast(`${action} in progress…`, "loading");
    try {
      const result = await analyzeTextDocument({
        text,
        title,
        readingLevel,
        language: targetLanguage,
      });
      setReaderAnalysis(result.analysis);
      setQuickActionResult({ type: actionId, analysis: result.analysis });
      setActionFeedback({ action, rating: null, comment: "", submitted: false });
      if (actionId === "simplify") {
        setLevel("simple");
        setView("overview");
      }
      if (actionId === "summarize" || actionId === "mind-map") setView("points");
      showToast(`${action} complete.`, "success");
      window.setTimeout(() => {
        document.querySelector(".smart-action-result")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 0);
      return true;
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : `${action} failed.`} Check your connection and analysis API configuration, then try again.`, "error");
      return false;
    } finally {
      setIsAnalyzingReader(false);
    }
  }

  function stopSpeech() {
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    if (speechObjectUrlRef.current) {
      URL.revokeObjectURL(speechObjectUrlRef.current);
      speechObjectUrlRef.current = null;
    }
    setIsGeneratingSpeech(false);
    setIsSpeaking(false);
  }

  async function toggleSpeech() {
    if (isSpeaking || isGeneratingSpeech) {
      stopSpeech();
      showToast("Read aloud stopped.", "info");
      return;
    }

    const content = view === "points" ? points.join(". ") : view === "original" ? text : activeText;
    if (content.length > 40_000) {
      showToast("Read aloud supports up to 40,000 characters at a time. Choose a shorter reader view and try again.", "error");
      return false;
    }
    const controller = new AbortController();
    speechRequestRef.current = controller;
    setIsGeneratingSpeech(true);
    showToast("Sending text to ElevenLabs for speech…", "loading");
    try {
      const audioBlob = await synthesizeSpeech({
        text: content,
        voice,
        language,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;

      const objectUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(objectUrl);
      speechObjectUrlRef.current = objectUrl;
      speechAudioRef.current = audio;
      audio.addEventListener("ended", () => {
        stopSpeech();
        setActionFeedback({ action: "Read aloud", rating: null, comment: "", submitted: false });
        showToast("Read aloud finished.", "success");
      }, { once: true });
      audio.addEventListener("error", () => {
        stopSpeech();
        showToast("Generated audio could not be played by this browser. Try a current browser and press Listen again.", "error");
      }, { once: true });
      await audio.play();
      setIsSpeaking(true);
      showToast("Read aloud is playing. Use Stop to end playback.", "success");
      return true;
    } catch (error) {
      const wasCancelled = controller.signal.aborted;
      stopSpeech();
      if (!wasCancelled) {
        showToast(`${error instanceof Error ? error.message : "Read aloud could not be completed."} Check the ElevenLabs API key, voice settings, and account quota.`, "error");
      }
      return false;
    } finally {
      if (speechRequestRef.current === controller) {
        speechRequestRef.current = null;
        setIsGeneratingSpeech(false);
      }
    }
  }

  async function transcribeRecording(recording) {
    setIsListening(false);
    setIsDictating(false);
    setIsTranscribing(true);
    showToast("Sending your recording to ElevenLabs for transcription…", "loading");
    let audioContext;
    try {
      const recordedAudio = new Blob(recording.chunks, { type: recording.recorder.mimeType });
      if (!recordedAudio.size) {
        showToast("No microphone audio was recorded. Check your microphone and record again.", "error");
        return;
      }
      if (recordedAudio.size > 4 * 1024 * 1024) {
        showToast("Recordings must be 4 MB or smaller. Record a shorter clip and try again.", "error");
        return;
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Audio conversion is not available in this browser.");
      }
      audioContext = new AudioContextConstructor();
      recording.audioContext = audioContext;
      const decodedAudio = await audioContext.decodeAudioData(await recordedAudio.arrayBuffer());
      if (decodedAudio.duration > 180) {
        showToast("Recordings are limited to 3 minutes. Record a shorter clip and try again.", "error");
        return;
      }

      const controller = new AbortController();
      recording.transcriptionRequest = controller;
      const transcript = (await transcribeSpeech({
        audio: recordedAudio,
        language: recording.recognitionLanguage,
        signal: controller.signal,
      })).trim();
      if (!transcript) {
        showToast("No speech was recognized. Check microphone permission and speak clearly before recording again.", "error");
        return;
      }

      if (recording.mode === "command") {
        setVoiceCommandInput(transcript);
        showToast("Voice command recognized. Review it, then press the arrow to apply.", "success");
      } else {
        setManualText((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${transcript}`);
        showToast("Speech recognized and added to your text.", "success");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        showToast(`${error instanceof Error ? error.message : "Speech recognition failed."} Check the ElevenLabs API key and try again.`, "error");
      }
    } finally {
      recording.stream.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== "closed") await audioContext.close();
      if (recordingRef.current === recording) recordingRef.current = null;
      setIsTranscribing(false);
    }
  }

  async function startSpeechCapture(mode) {
    if (isTranscribing || isApplyingReaderCommand || recordingRef.current || captureStartingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("Microphone recording is not available in this browser. Use a current Chrome or Edge browser.", "error");
      return;
    }

    captureStartingRef.current = true;
    setIsStartingCapture(true);
    let stream;
    try {
      const { recognitionLanguages: installedLanguages, speechConfigured } = await getSpeechServiceHealth();
      setIsSpeechConfigured(speechConfigured);
      setRecognitionLanguages(installedLanguages);
      if (!speechConfigured) {
        throw new Error("ElevenLabs is not configured. Add ELEVENLABS_API_KEY to backend/.env, then restart the backend.");
      }
      if (installedLanguages.length === 0) {
        throw new Error("ElevenLabs has no speech recognition languages available for this account.");
      }
      const activeRecognitionLanguage = installedLanguages.includes(recognitionLanguage)
        ? recognitionLanguage
        : installedLanguages[0];
      if (activeRecognitionLanguage !== recognitionLanguage) {
        setRecognitionLanguage(activeRecognitionLanguage);
        showToast(`Using ${activeRecognitionLanguage} for speech recognition.`, "info");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const recording = {
        mode,
        recognitionLanguage: activeRecognitionLanguage,
        stream,
        recorder,
        chunks: [],
        failed: false,
        audioContext: null,
        transcriptionRequest: null,
      };
      recordingRef.current = recording;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) recording.chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recording.failed) return;
        void transcribeRecording(recording);
      }, { once: true });
      recorder.addEventListener("error", () => {
        recording.failed = true;
        stream.getTracks().forEach((track) => track.stop());
        recordingRef.current = null;
        setIsListening(false);
        setIsDictating(false);
        showToast("Microphone recording failed. Check that your microphone is connected and permitted, then try again.", "error");
      }, { once: true });
      recorder.start();
      if (mode === "command") setIsListening(true);
      else setIsDictating(true);
      showToast(mode === "command"
        ? `Listening in ${activeRecognitionLanguage}. Speak, then press the microphone again to transcribe.`
        : `Listening in ${activeRecognitionLanguage}. Speak, then press the microphone again to transcribe.`, "info");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (error instanceof Error && error.name === "NotAllowedError") {
        showToast("Microphone access was denied. Allow microphone access for this site in your browser settings, then try again.", "error");
      } else {
        showToast(`${error instanceof Error ? error.message : "Could not start microphone recording."} Check the backend, ElevenLabs API key, and microphone permission, then try again.`, "error");
      }
    } finally {
      captureStartingRef.current = false;
      setIsStartingCapture(false);
    }
  }

  function stopSpeechCapture() {
    const recording = recordingRef.current;
    if (!recording || recording.recorder.state === "inactive") return;
    try {
      recording.recorder.stop();
      setIsListening(false);
      setIsDictating(false);
    } catch (error) {
      recording.stream.getTracks().forEach((track) => track.stop());
      recordingRef.current = null;
      setIsListening(false);
      setIsDictating(false);
      showToast(`${error instanceof Error ? error.message : "Could not stop microphone recording."} Restart the recording and try again.`, "error");
    }
  }

  function toggleVoiceCommands() {
    if (isListening) {
      stopSpeechCapture();
      return;
    }
    if (isDictating || isTranscribing || isApplyingReaderCommand) return;
    void startSpeechCapture("command");
  }

  function sendVoiceCommand(event) {
    event.preventDefault();
    const command = voiceCommandInput.trim();
    if (!command || isApplyingReaderCommand) return;
    if (!text.trim()) {
      showToast("Add a document or paste text before asking the model to change it.", "error");
      return;
    }

    setIsApplyingReaderCommand(true);
    showToast("Applying your command to the document…", "loading");
    void applyReaderCommand({ text, command, title, language })
      .then((updatedText) => {
        setText(updatedText);
        setReaderAnalysis(null);
        setQuickActionResult(null);
        setIsAnalyzedByModel(false);
        setIsReaderTextModified(true);
        setIsSample(false);
        setLevel("detailed");
        setView("overview");
        setVoiceCommandInput("");
        setActionFeedback({ action: "Voice command edit", rating: null, comment: "", submitted: false });
        showToast("Document updated. Your revised text is shown in the reader.", "success");
      })
      .catch((error) => {
        showToast(`${error instanceof Error ? error.message : "The model could not apply your command."} Your document is unchanged.`, "error");
      })
      .finally(() => setIsApplyingReaderCommand(false));
  }

  async function togglePictureExplanation() {
    if (pictureExplanationOpen) {
      setPictureExplanationOpen(false);
      return;
    }
    setPictureExplanationOpen(true);
    if (readerAnalysis?.pictureScenes || !text.trim() || isAnalyzingReader) return;

    setIsAnalyzingReader(true);
    showToast("Generating a picture of your document…", "loading");
    try {
      const result = await analyzeTextDocument({ text, title, readingLevel: level, language });
      setReaderAnalysis(result.analysis);
      setIsAnalyzedByModel(true);
      showToast("Your document picture is ready.", "success");
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : "Could not generate the document picture."} Check the model connection, then try again.`, "error");
    } finally {
      setIsAnalyzingReader(false);
    }
  }

  function toggleDictation() {
    if (isDictating) {
      stopSpeechCapture();
      return;
    }
    if (isListening || isTranscribing || isApplyingReaderCommand) return;
    void startSpeechCapture("dictation");
  }

  function sendAssistantMessage(event) {
    event.preventDefault();
    const question = assistantInput.trim();
    if (!question) return;

    const normalized = question.toLowerCase();
    let answer;
    if (/(upload|file|document|paste|type|text box)/.test(normalized)) {
      answer = "To add content, upload or drop a TXT, DOCX, PPTX, or PDF file in “Add a document”, or paste/type it in the text box below and choose “Use this text”. Your files are read locally in this browser.";
    } else if (/(simpl|reading level|detail|easier)/.test(normalized)) {
      answer = "Use the “How much detail?” controls in the reader. Choose Simpler, Balanced, or Detailed to change the reading preview.";
    } else if (/(key point|main idea|important|summari[sz])/.test(normalized)) {
      const summary = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
      answer = `Here are a few key ideas from “${documentName}”:\n${summary.map((sentence) => `• ${sentence}`).join("\n")}`;
    } else if (/(listen|audio|read aloud|speech)/.test(normalized)) {
      answer = "Choose a voice, then press Listen in the reader controls to hear the current view. Press Stop to end playback.";
    } else if (/(voice command|microphone|dictat|speak)/.test(normalized)) {
      answer = "Use Dictate text in the paste panel to speak text into the text box. The Voice commands button in the reader transcribes an instruction for you to review before applying. Both require browser microphone permission and an ElevenLabs API key configured on the backend.";
    } else if (/(language|translate|spanish|hindi)/.test(normalized)) {
      answer = "Choose a language from “Read in”. Spanish and Hindi translations are sample previews for the included example; uploaded or pasted text stays in its original language.";
    } else if (/(dark mode|dark theme|appearance)/.test(normalized)) {
      answer = "Use the Dark mode button in the top bar to switch the page theme. It can be used together with High contrast.";
    } else if (/(what|about|document|reading|text)/.test(normalized)) {
      answer = `You’re viewing “${documentName}”. Here’s a short preview: ${text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(" ")}`;
    } else {
      answer = "I can help with uploading or pasting text, reading levels, key points, audio, voice controls, languages, and dark mode. What would you like to know?";
    }

    setAssistantMessages((messages) => [
      ...messages,
      { role: "user", text: question },
      { role: "assistant", text: answer },
    ]);
    setAssistantInput("");
  }

  function openDocumentChat() {
    const newChat = {
      id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Document analysis",
      messages: [],
    };
    setDocumentChats([newChat]);
    setActiveDocumentChatId(newChat.id);
    setDocumentDraft(text.trim() ? text : "");
    setChatFileName("");
    setActionFeedback(null);
    setDocumentChatOpen(true);
    setAssistantOpen(false);
    window.setTimeout(() => {
      document.querySelector("#document-chat-input")?.focus({ preventScroll: true });
    }, 0);
  }

  function submitActionFeedback(event) {
    event.preventDefault();
    if (!actionFeedback?.rating || actionFeedback.submitted) return;
    try {
      const storedFeedback = window.localStorage.getItem(ACTION_FEEDBACK_STORAGE_KEY);
      const history = storedFeedback ? JSON.parse(storedFeedback) : [];
      if (!Array.isArray(history)) throw new Error("Saved feedback data is invalid.");
      history.push({
        action: actionFeedback.action,
        rating: actionFeedback.rating,
        comment: actionFeedback.comment.trim(),
        createdAt: new Date().toISOString(),
      });
      window.localStorage.setItem(ACTION_FEEDBACK_STORAGE_KEY, JSON.stringify(history.slice(-30)));
      setActionFeedback((current) => current ? { ...current, submitted: true } : current);
      showToast("Thanks for your feedback. It was saved on this device.", "success");
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : "Feedback could not be saved."} Check browser storage settings and try again.`, "error");
    }
  }

  async function handleChatFile(file) {
    if (!file) return;
    showToast(`Opening ${file.name} and extracting its text…`, "loading");
    try {
      const content = (await readDocumentText(file)).trim();
      if (!content) {
        showToast(
          getDocumentExtension(file.name) === ".pdf"
            ? "No selectable text was found in this PDF. Scanned PDFs need OCR and are not supported yet."
            : "This file has no readable text. Choose another document.",
          "error",
        );
        return;
      }
      setDocumentDraft(content);
      setChatFileName(file.name);
      showToast(`${file.name} is ready to analyze.`, "success");
    } catch (error) {
      showToast(`Couldn't open ${file.name}: ${error instanceof Error ? error.message : "Please try another file."} Check the file format and try another document.`, "error");
    } finally {
      if (chatFileInput.current) chatFileInput.current.value = "";
    }
  }

  async function analyzeDocument(event) {
    event.preventDefault();
    const content = documentDraft.trim();
    if (!content) {
      showToast("Add document text or attach a supported document before sending.");
      return;
    }
    setActionFeedback(null);
    setIsAnalyzingDocument(true);
    showToast("Analyzing your document…", "loading");
    try {
      const documentTitle = chatFileName || content.split(/\s+/).slice(0, 6).join(" ").slice(0, 120);
      const result = await analyzeTextDocument({
        text: content,
        title: documentTitle,
        readingLevel: level,
        language,
      });
      const { overview, readingLevels, keyPoints } = result.analysis;
      const analysis = [
        `Document overview\n${overview}`,
        `Simple explanation\n${readingLevels.simple}`,
        `Balanced explanation\n${readingLevels.balanced}`,
        `Detailed explanation\n${readingLevels.detailed}`,
        `Key ideas\n${keyPoints.map((idea) => `• ${idea}`).join("\n")}`,
      ].join("\n\n");

      setDocumentChats((currentChats) => currentChats.map((chat) => {
        if (chat.id !== activeDocumentChatId) return chat;
        return {
          ...chat,
          title: chat.messages.length === 0
            ? result.title.slice(0, 32) + (result.title.length > 32 ? "…" : "")
            : chat.title,
          messages: [
            ...chat.messages,
            { role: "user", text: chatFileName ? `Analyze document: ${chatFileName}` : content },
            { role: "analysis", text: analysis },
          ],
        };
      }));
      setText(content);
      setTitle(result.title);
      setReaderAnalysis(result.analysis);
      setQuickActionResult(null);
      setIsReaderTextModified(false);
      setIsSample(false);
      setIsAnalyzedByModel(true);
      setLevel(result.readingLevel);
      setLanguage(result.language);
      setView("overview");
      setActionFeedback({ action: "Document analysis", rating: null, comment: "", submitted: false });
      setManualText(content);
      setDocumentDraft("");
      setChatFileName("");
      if (chatFileInput.current) chatFileInput.current.value = "";
      showToast(`Document analysis complete${result.model ? ` using ${result.model}` : ""}.`, "success");
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : "Text analysis failed."} Check that the analysis backend and API key are configured, then try again.`, "error");
    } finally {
      setIsAnalyzingDocument(false);
    }
  }

  const rootClass = `app min-h-screen antialiased${darkMode ? " dark-mode" : ""}${contrast ? " high-contrast" : ""}${wideSpacing ? " wide-spacing" : ""}${documentChatOpen ? " document-chat-open" : ""}`;

  return (
    <div className={rootClass}>
      <aside className="sidebar" aria-label="Main navigation">
        <Brand />
        <div className="side-label">Workspace</div>
        <a className={`side-link${!documentChatOpen && !howItWorksOpen ? " active" : ""}`} href="#workspace" aria-current={!documentChatOpen && !howItWorksOpen ? "page" : undefined} onClick={() => {
          setDocumentChatOpen(false);
          setHowItWorksOpen(false);
        }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8m-8 3h8m-8 3h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          My reader
        </a>
        <button
          className="sidebar-browse-button"
          type="button"
          onClick={() => {
            setHowItWorksOpen(false);
            openDocumentChat();
          }}
        >
          {icons.upload}
          Ask AI about a document
        </button>
        <a
          className={`side-link${howItWorksOpen ? " active" : ""}`}
          href="#how-it-works"
          aria-current={howItWorksOpen ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            setDocumentChatOpen(false);
            setHowItWorksOpen(true);
          }}
        >
          {icons.question}
          How it works
        </a>
        <button
          className={`side-link translate-link${translateOpen ? " active" : ""}`}
          type="button"
          aria-expanded={translateOpen}
          aria-controls="sidebar-translate"
          onClick={() => setTranslateOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 5h10M9 3v2m4 0c-.5 4-3.5 7-7 9m1-6c1 2 3 4 5 5m2 7 4-10 4 10m-6.5-3h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Translate
        </button>
        {translateOpen && (
          <div className="sidebar-translate" id="sidebar-translate">
            <label htmlFor="sidebar-language">Translate to</label>
            <select
              id="sidebar-language"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                document.querySelector(".reader-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
                showToast(isSample
                  ? `Showing the ${event.target.value} sample preview.`
                  : "Translation is only previewed for the sample document.");
              }}
            >
              <option value="English">English</option>
              <option value="Spanish">Español (Spanish)</option>
              <option value="Hindi">हिन्दी (Hindi)</option>
            </select>
            <p>Translations are sample previews for the example document.</p>
          </div>
        )}
        <div className="side-bottom">
          <div className="help-card">
            <strong>A little help goes a long way</strong>
            <p>Choose a reading level, switch to key points, or press Listen to hear your document aloud.</p>
          </div>
          <div className="user-card">
            <span className="user-avatar" aria-hidden="true">G</span>
            <span><span className="user-name">Guest reader</span><span className="user-detail">Your personal workspace</span></span>
          </div>
        </div>
      </aside>

      <div className="workspace" id="workspace">
        <header className="topbar">
          <Brand mobile />
          <div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{documentChatOpen ? "Document chat" : howItWorksOpen ? "How it works" : "My reader"}</strong></div>
          <div className="top-actions">
            <button
              className="text-button"
              type="button"
              aria-pressed={darkMode}
              aria-label={darkMode ? "Turn off dark mode" : "Turn on dark mode"}
              onClick={() => {
                setDarkMode((enabled) => !enabled);
                showToast(darkMode ? "Dark mode is off." : "Dark mode is on.");
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20.2 15.4A8.8 8.8 0 0 1 8.6 3.8 8.9 8.9 0 1 0 20.2 15.4Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Dark mode</span>
            </button>
            <button
              className="text-button"
              type="button"
              aria-pressed={contrast}
              aria-label={contrast ? "Turn off high contrast" : "Turn on high contrast"}
              onClick={() => {
                setContrast((enabled) => !enabled);
                showToast(contrast ? "High contrast is off." : "High contrast is on.");
              }}
            >
              {icons.contrast}<span>High contrast</span>
            </button>
          </div>
        </header>

        <main className={`content${documentChatOpen ? " content-chat-mode" : ""}`}>
          {documentChatOpen ? (
            <section className="card document-chat dedicated-document-chat" aria-label="Document analysis chat" id="document-chat">
              <header className="document-chat-header">
                <span className="document-chat-icon">{icons.document}</span>
                <span><strong>{activeDocumentChat.title}</strong><span>Document analysis chat</span></span>
                <button className="chat-back-button" type="button" onClick={() => setDocumentChatOpen(false)}>Back to reader</button>
              </header>
              <div className="document-chat-messages" ref={documentMessagesRef} aria-live="polite">
                {activeDocumentChat.messages.length === 0 ? (
                  <div className="document-chat-empty">
                    <strong>{documentDraft.trim() ? "Your document is ready" : "Add a document to get an AI response"}</strong>
                    <span>{documentDraft.trim()
                      ? "I loaded the current reader text. Choose Get document response for an overview, reading-level explanations, and key ideas."
                      : "Paste text below or attach a TXT, DOCX, PPTX, or text-based PDF. Then choose Get document response for an overview and key ideas."}</span>
                  </div>
                ) : activeDocumentChat.messages.map((message, index) => (
                  <article className={`document-chat-message ${message.role}`} key={`${activeDocumentChat.id}-${index}`}>
                    <span className="document-message-label">{message.role === "user" ? "You" : "Analysis"}</span>
                    <div>{message.text}</div>
                  </article>
                ))}
              </div>
              <ActionFeedback
                feedback={actionFeedback}
                onChange={setActionFeedback}
                onSubmit={submitActionFeedback}
              />
              <form className="document-chat-form" onSubmit={analyzeDocument}>
                <label className="sr-only" htmlFor="document-chat-input">Paste document text to analyze</label>
                <textarea
                  id="document-chat-input"
                  value={documentDraft}
                  onChange={(event) => {
                    setDocumentDraft(event.target.value);
                    if (chatFileName) setChatFileName("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={chatFileName ? `Ready to analyze ${chatFileName}` : "Paste document text to get an AI overview and key ideas..."}
                  rows="3"
                />
                <input
                  ref={chatFileInput}
                  className="visually-hidden-input"
                  type="file"
                  accept=".txt,.docx,.pptx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  aria-label="Attach a document"
                  onChange={(event) => handleChatFile(event.target.files?.[0])}
                />
                <div className="document-chat-actions">
                  <button className="attach-document-button" type="button" onClick={() => chatFileInput.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.5 3.5 0 0 1 5 5l-8.2 8.2a2 2 0 0 1-2.8-2.8l7.5-7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {chatFileName || "Attach a document"}
                  </button>
                  <button className="send-document-button" type="submit" disabled={!documentDraft.trim() || isAnalyzingDocument}>
                    <span>{isAnalyzingDocument ? "Analyzing…" : "Get document response"}</span>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </form>
            </section>
          ) : howItWorksOpen ? (
            <section className="how-page" aria-labelledby="how-page-title">
              <div className="how-page-heading">
                <span className="eyebrow"><span className="eyebrow-dot" />A quick guide to your workspace</span>
                <h1 id="how-page-title">How UniRead works</h1>
                <p>Turn supported text documents into a reading experience you can tailor to your needs.</p>
              </div>
              <div className="how-page-steps">
                <article className="how-page-card">
                  <span className="how-page-number">01</span>
                  <span className="how-page-icon">{icons.upload}</span>
                  <h2>Add your text</h2>
                  <p>Use <strong>Ask AI about a document</strong> to get an overview and key ideas, or add a TXT, DOCX, PPTX, or text-based PDF, or paste text from <strong>My reader</strong>. Files are read locally in your browser.</p>
                </article>
                <article className="how-page-card">
                  <span className="how-page-number">02</span>
                  <span className="how-page-icon">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6h14M5 12h9M5 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </span>
                  <h2>Make it yours</h2>
                  <p>Choose a reading level, or use Smart quick actions to simplify, translate to Telugu, summarize, or build a mind map. Set keyboard shortcuts and save action sequences for repeat workflows.</p>
                </article>
                <article className="how-page-card">
                  <span className="how-page-number">03</span>
                  <span className="how-page-icon">{icons.sound}</span>
                  <h2>Read or listen</h2>
                  <p>Listen uses ElevenLabs text-to-speech. You can also dictate commands such as “key points”; review the transcription and send it with the arrow. Speech requires an ElevenLabs API key and browser microphone permission.</p>
                </article>
              </div>
              <section className="how-page-note">
                <h2>About this prototype</h2>
                <p>Smart quick actions and document analysis use the configured model provider; saved shortcuts and action sequences stay in this browser. Read aloud and voice recognition use ElevenLabs through the backend; the API key stays on the server. Reader-level and sample translation controls remain previews, and picture explanation is a placeholder.</p>
              </section>
              <button
                className="how-page-back"
                type="button"
                onClick={() => setHowItWorksOpen(false)}
              >Back to My reader</button>
            </section>
          ) : (
          <>
          <section className="welcome" id="how-it-works" aria-labelledby="page-title">
            <div className="eyebrow"><span className="eyebrow-dot" />A calmer way to understand what you read</div>
            <h1 id="page-title">Understand your documents. Your way.</h1>
            <p>Add a document to get a clear reading preview. Make it simpler, find the key points, or listen along.</p>
          </section>
          <div className="main-grid">
            <section className="featured-action" aria-label="Quick document action">
              <span className="featured-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M6 5h12M6 9h12M6 13h8M6 17h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="m17 15 2 2 3-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="featured-action-copy">
                <strong>Need the key ideas fast?</strong>
                <span>Generate a concise summary from the current document.</span>
              </div>
              <button
                type="button"
                className="featured-action-button"
                onClick={() => void runQuickAction("summarize")}
                disabled={!text.trim() || isAnalyzingReader || isTranscribing || isReadingFile}
              >
                Summarize document
              </button>
            </section>
            <div className="primary-column">
              <section className="card upload-card" aria-labelledby="upload-heading">
                <div className="card-heading">
                  <span className="step-number" aria-hidden="true">1</span>
                  <span><h2 id="upload-heading">Add a document</h2><p>Choose a TXT, DOCX, PPTX, or PDF file from your device, or try the example.</p></span>
                </div>
                <label
                  className={`dropzone${dragging ? " dragging" : ""}`}
                  htmlFor="file-input"
                  tabIndex="0"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInput.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    chooseFile(event.dataTransfer.files?.[0]);
                  }}
                >
                  <span className="upload-icon">{icons.upload}</span>
                  <span className="upload-instructions"><strong>Drop a document here</strong> or choose from your device<span>TXT, DOCX, PPTX, and text PDFs · Convert older DOC/PPT files first</span></span>
                  <span className="upload-select" aria-hidden="true">Browse it</span>
                </label>
                <input
                  ref={fileInput}
                  id="file-input"
                  type="file"
                  disabled={isAnalyzingReader || isReadingFile}
                  accept=".txt,.docx,.pptx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                {hasUploadedDocument && (
                  <div className="upload-analysis-action">
                    <span>Document added: <strong>{title}</strong></span>
                    <button
                      className="manual-submit"
                      type="button"
                      onClick={analyzeReaderDocument}
                      disabled={isAnalyzingReader}
                    >
                      {isAnalyzingReader ? "Analyzing…" : "Analyze document"}
                    </button>
                  </div>
                )}
                <p className="upload-footnote">Want to see how it works first? <button type="button" onClick={openSample}>Open the sample document</button></p>
              </section>

              <section className="card manual-entry-card" aria-labelledby="manual-entry-heading">
                <div className="card-heading">
                  <span className="step-number" aria-hidden="true">2</span>
                  <span><h2 id="manual-entry-heading">Or paste your text</h2><p>Type or paste text here to read it without uploading a file.</p></span>
                </div>
                <label className="manual-entry-label" htmlFor="manual-text">Your text</label>
                <textarea
                  id="manual-text"
                  className="manual-textarea"
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      useManualText();
                    }
                  }}
                  placeholder="Paste or type your document text..."
                  rows="5"
                />
                <button
                  className="customize-output-toggle"
                  type="button"
                  aria-expanded={outputCustomizationOpen}
                  aria-controls="output-customization"
                  onClick={() => setOutputCustomizationOpen((open) => !open)}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <span>{outputCustomizationOpen ? "Hide output options" : "Customize output"}</span>
                  <span className="customize-chevron" aria-hidden="true">{outputCustomizationOpen ? "−" : "+"}</span>
                </button>
                {outputCustomizationOpen && (
                  <div className="output-customization" id="output-customization">
                    <div className="output-setting">
                      <label htmlFor="output-line-limit">Maximum output lines</label>
                      <select
                        id="output-line-limit"
                        value={outputLineLimit}
                        onChange={(event) => setOutputLineLimit(event.target.value)}
                      >
                        <option value="none">Show all lines</option>
                        <option value="3">3 lines</option>
                        <option value="5">5 lines</option>
                        <option value="8">8 lines</option>
                        <option value="12">12 lines</option>
                        <option value="20">20 lines</option>
                      </select>
                    </div>
                    <div className="output-setting">
                      <label htmlFor="output-language">Preferred language</label>
                      <select
                        id="output-language"
                        value={language}
                        onChange={(event) => setLanguage(event.target.value)}
                      >
                        <option value="English">English</option>
                        <option value="Spanish">Español (Spanish)</option>
                        <option value="Hindi">हिन्दी (Hindi)</option>
                      </select>
                    </div>
                    <div className="output-setting">
                      <label htmlFor="output-font">Reading font</label>
                      <select
                        id="output-font"
                        value={outputFont}
                        onChange={(event) => setOutputFont(event.target.value)}
                      >
                        <option value="sans">Clean sans-serif</option>
                        <option value="verdana">Easy-read (Verdana)</option>
                        <option value="serif">Book-style (Georgia)</option>
                        <option value="mono">Monospace</option>
                      </select>
                    </div>
                    <p className="output-customization-note">Font and line limits apply to the reader and generated responses. Language updates the sample preview and is used for the next AI-generated response.</p>
                  </div>
                )}
                <div className="manual-entry-footer">
                  <span>{manualText.length.toLocaleString()} characters</span>
                  <div className="manual-entry-actions">
                    <label className="speech-language-control">
                  <span className="sr-only">Speech recognition language</span>
                  <select
                    aria-label="Speech recognition language"
                    value={recognitionLanguages.includes(recognitionLanguage) ? recognitionLanguage : ""}
                    disabled={isLoadingSpeechHealth || recognitionLanguages.length === 0 || isStartingCapture || isTranscribing}
                    onChange={(event) => setRecognitionLanguage(event.target.value)}
                  >
                    {recognitionLanguages.length === 0 && <option value="">{isLoadingSpeechHealth ? "Checking speech service…" : isSpeechConfigured ? "Speech languages unavailable" : "Add ElevenLabs API key"}</option>}
                    {recognitionLanguages.map((installedLanguage) => <option key={installedLanguage} value={installedLanguage}>{installedLanguage} recognition</option>)}
                  </select>
                    </label>
                    <button
                      className={`dictation-button${isDictating ? " listening" : ""}`}
                      type="button"
                      aria-label={isStartingCapture ? "Starting microphone" : isTranscribing ? "Transcribing speech" : isDictating ? "Stop voice dictation" : "Dictate text"}
                      aria-pressed={isDictating}
                      onClick={toggleDictation}
                      disabled={isStartingCapture || isTranscribing || isListening || isApplyingReaderCommand}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      <span>{isStartingCapture ? "Starting…" : isTranscribing ? "Transcribing…" : isDictating ? "Stop dictation" : "Dictate text"}</span>
                    </button>
                    <button className="manual-submit" type="button" onClick={useManualText}>Use this text</button>
                  </div>
                </div>
              </section>

              <section className="card reader-card" aria-labelledby="reader-heading">
                <header className="reader-header">
                  <div className="reader-heading">
                    <span className="document-icon">{icons.document}</span>
                    <span className="document-copy">
                      <span className="document-name" id="reader-heading">{documentName}</span>
                      <span className="document-meta">{isSample ? "Sample document · Ready to explore" : "Document · Read locally in your browser"}</span>
                    </span>
                  </div>
                  <button className="change-file" type="button" onClick={() => fileInput.current?.click()} disabled={isAnalyzingReader || isReadingFile}>Choose another</button>
                </header>
                <div className="reader-body">
                  <div className="reader-options">
                    <div>
                      <span className="option-label">How much detail?</span>
                      <div className="level-options" role="group" aria-label="Choose reading level">
                        {["simple", "balanced", "detailed"].map((item) => (
                          <button key={item} type="button" aria-pressed={level === item} disabled={isAnalyzingReader || isAnalyzingDocument} onClick={() => void changeReadingLevel(item)}>
                            {item[0].toUpperCase() + item.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      className="picture-explanation-toggle"
                      type="button"
                      aria-expanded={pictureExplanationOpen}
                      aria-controls="picture-explanation"
                      disabled={isAnalyzingReader || isAnalyzingDocument}
                      onClick={() => void togglePictureExplanation()}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
                        <circle cx="9" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.5" />
                        <path d="m5 17 4.5-4 3 2 2.5-2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Picture explanation
                    </button>
                    <label className="language-control"><span className="option-label">Read in</span>
                      <select aria-label="Choose reading language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                        <option value="English">English</option>
                        <option value="Spanish">Español · sample</option>
                        <option value="Hindi">हिन्दी · sample</option>
                      </select>
                    </label>
                  </div>
                  <SmartQuickActions
                    busy={isAnalyzingReader || isTranscribing || isReadingFile}
                    isSpeaking={isSpeaking}
                    onRunAction={runQuickAction}
                    onFeedback={(type, message) => showToast(message, type)}
                    onStorageError={(message) => showToast(`${message} Your quick actions may not persist after closing this page.`, "error")}
                  />
                  {pictureExplanationOpen && (
                    <section className="picture-explanation" id="picture-explanation" aria-label="Picture explanation">
                      <div className="picture-scene-container">
                        <PictorialDocumentScene scene={pictureScene} documentName={documentName} level={level} />
                      </div>
                      <div className="picture-nutshell">
                        <span>AI pictorial visualization · {level[0].toUpperCase() + level.slice(1)}</span>
                        <p lang={language}>{pictureExplanation}</p>
                      </div>
                    </section>
                  )}
                  <div className="reader-tabs" role="tablist" aria-label="Document view">
                    {[
                      ["overview", "Plain-language view"],
                      ["points", "Key points"],
                      ["original", "Full text"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        id={`tab-${key}`}
                        type="button"
                        role="tab"
                        aria-selected={view === key}
                        aria-controls="reader-output"
                        onClick={() => setView(key)}
                      >{label}</button>
                    ))}
                  </div>
                  <div className="output-label">{outputLabel}</div>
                  {quickActionResult && (
                    <section className="smart-action-result" aria-live="polite" aria-labelledby="smart-action-result-heading">
                      <div className="smart-action-result-heading">
                        <h3 id="smart-action-result-heading">
                          {{
                            simplify: "Simplified text",
                            "translate-telugu": "Telugu translation",
                            summarize: "Document summary",
                            "mind-map": "Mind map",
                          }[quickActionResult.type]}
                        </h3>
                        <button type="button" onClick={() => setQuickActionResult(null)} aria-label="Dismiss quick action result">×</button>
                      </div>
                      <div className={outputContentClass} style={outputContentStyle}>
                        {quickActionResult.type === "simplify" && <p>{quickActionResult.analysis.readingLevels.simple}</p>}
                        {quickActionResult.type === "translate-telugu" && (
                          <>
                            <p lang="te">{quickActionResult.analysis.overview}</p>
                            <p lang="te">{quickActionResult.analysis.readingLevels.simple}</p>
                            <ul lang="te">
                              {quickActionResult.analysis.keyPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}
                            </ul>
                          </>
                        )}
                        {quickActionResult.type === "summarize" && (
                          <>
                            <p>{quickActionResult.analysis.overview}</p>
                            <ul>{quickActionResult.analysis.keyPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul>
                          </>
                        )}
                        {quickActionResult.type === "mind-map" && (
                          <div className="mind-map" role="group" aria-label={`Mind map for ${title}`}>
                            <div className="mind-map-root">
                              <strong>{title}</strong>
                              <span>{quickActionResult.analysis.overview}</span>
                            </div>
                            <ol className="mind-map-branches">
                              {quickActionResult.analysis.keyPoints.map((point, index) => (
                                <li key={`${index}-${point}`}><span>{point}</span></li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                  <ActionFeedback
                    feedback={actionFeedback}
                    onChange={setActionFeedback}
                    onSubmit={submitActionFeedback}
                  />
                  {readerAnalysis && (
                    <section
                      className="reader-analysis-result"
                      id="reader-analysis-result"
                      aria-label="Document analysis response"
                      aria-live="polite"
                      ref={readerAnalysisRef}
                    >
                      <h3>Document analysis</h3>
                      <div className={outputContentClass} style={outputContentStyle}>
                        <div>
                          <h4>Overview</h4>
                          <p>{readerAnalysis.overview}</p>
                        </div>
                        <div>
                          <h4>{level[0].toUpperCase() + level.slice(1)} explanation</h4>
                          <p>{readerAnalysis.readingLevels[level]}</p>
                        </div>
                        <div>
                          <h4>Key ideas</h4>
                          <ul>
                            {readerAnalysis.keyPoints.map((point, index) => (
                              <li key={`${index}-${point}`}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>
                  )}
                  <div
                    className={`reader-text font-${outputFont}`}
                    id="reader-output"
                    role="tabpanel"
                    aria-labelledby={`tab-${view}`}
                    tabIndex="0"
                    aria-live="polite"
                  >
                    <div
                      className={outputContentClass}
                      style={outputContentStyle}
                    >
                      {view === "points" ? (
                        <ul className="points-list">
                          {points.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}
                        </ul>
                      ) : view === "original" ? text : (
                        <>
                          <h3>{documentName}</h3>
                          <p>{activeText}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <section className="reader-steps" aria-label={`Document explained in three steps at ${level} detail`}>
                    <h3>Understand “{documentName}” in three steps · {level}</h3>
                    <div className={outputContentClass} style={outputContentStyle}>
                      <div className="reader-steps-list">
                        {explanationSteps.map((step, index) => (
                          <div className="reader-step" key={`${level}-${index}-${step}`}>
                            <span>{index + 1}</span>
                            <p><strong>Step {index + 1}</strong>{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                  <div className="reader-footer">
                    <span className="preview-note">{previewNote}</span>
                    <div className="read-tools">
                      <div className="read-controls" role="group" aria-label="Reading comfort and audio">
                        <button
                          className="small-control"
                          type="button"
                          aria-label="Decrease text size"
                          title="Decrease text size"
                          onClick={() => {
                            const nextSize = Math.max(10, fontSize - 1);
                            setFontSize(nextSize);
                            showToast(`Text size: ${nextSize}px.`);
                          }}
                        >A−</button>
                        <button
                          className="small-control"
                          type="button"
                          aria-label="Increase text size"
                          title="Increase text size"
                          onClick={() => {
                            const nextSize = Math.min(20, fontSize + 1);
                            setFontSize(nextSize);
                            showToast(`Text size: ${nextSize}px.`);
                          }}
                        >A+</button>
                        <button
                          className="small-control"
                          type="button"
                          aria-label="Toggle extra line spacing"
                          aria-pressed={wideSpacing}
                          title="Toggle extra line spacing"
                          onClick={() => {
                            setWideSpacing((enabled) => !enabled);
                            showToast(wideSpacing ? "Extra line spacing is off." : "Extra line spacing is on.");
                          }}
                        >↕</button>
                        <select className="small-control" aria-label="Choose a spoken voice" title="Choose a spoken voice" value={voice} onChange={(event) => setVoice(event.target.value)}>
                          <option value="female">Female voice</option>
                          <option value="male">Male voice</option>
                        </select>
                        <button className="listen-button" type="button" onClick={toggleSpeech} aria-pressed={isSpeaking || isGeneratingSpeech}>
                          {icons.sound}<span>{isGeneratingSpeech ? "Preparing…" : isSpeaking ? "Stop" : "Listen"}</span>
                        </button>
                      </div>
                      <form className="voice-command-composer" onSubmit={sendVoiceCommand}>
                        <label className="speech-language-control">
                          <span className="sr-only">Speech recognition language</span>
                          <select
                            aria-label="Speech recognition language"
                            value={recognitionLanguages.includes(recognitionLanguage) ? recognitionLanguage : ""}
                            disabled={isLoadingSpeechHealth || recognitionLanguages.length === 0 || isStartingCapture || isTranscribing || isApplyingReaderCommand}
                            onChange={(event) => setRecognitionLanguage(event.target.value)}
                          >
                            {recognitionLanguages.length === 0 && <option value="">{isLoadingSpeechHealth ? "Checking speech service…" : isSpeechConfigured ? "Speech languages unavailable" : "Add ElevenLabs API key"}</option>}
                            {recognitionLanguages.map((installedLanguage) => <option key={installedLanguage} value={installedLanguage}>{installedLanguage} recognition</option>)}
                          </select>
                        </label>
                        <button
                          className={`voice-command-button${isListening ? " listening" : ""}`}
                          type="button"
                          aria-label={isStartingCapture ? "Starting microphone" : isTranscribing ? "Transcribing speech" : isListening ? "Stop voice commands" : "Dictate a reader command"}
                          aria-pressed={isListening}
                          title={isTranscribing ? "Transcribing speech" : isListening ? "Stop voice commands" : "Dictate a reader command"}
                          onClick={toggleVoiceCommands}
                          disabled={isStartingCapture || isTranscribing || isDictating || isApplyingReaderCommand}
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          </svg>
                        </button>
                        <label className="sr-only" htmlFor="voice-command-input">Type or dictate a reader command</label>
                        <input
                          id="voice-command-input"
                          value={voiceCommandInput}
                          onChange={(event) => setVoiceCommandInput(event.target.value)}
                          placeholder={isStartingCapture ? "Starting microphone…" : isTranscribing ? "Transcribing your command…" : isApplyingReaderCommand ? "Applying your instruction…" : isListening ? "Listening for your instruction…" : "Type or dictate what to change in this document…"}
                          autoComplete="off"
                        />
                        <button className="voice-command-send" type="submit" aria-label="Apply reader command" disabled={!voiceCommandInput.trim() || isApplyingReaderCommand || isTranscribing}>
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </form>
                      <p className="voice-help">Speak or type an instruction, then press the arrow. The model edits the document in place; the revised text appears in the reader, not a separate answer tab. Recordings and read-aloud text are sent to ElevenLabs for processing.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

          </div>
          </>
          )}
        </main>
      </div>
      {toast && (
        <div
          key={toast.id}
          className={`toast toast-${toast.type} visible`}
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <span className={`toast-indicator${toast.type === "loading" ? " toast-spinner" : ""}`} aria-hidden="true">
            {toast.type === "success" ? "✓" : toast.type === "error" ? "!" : toast.type === "loading" ? "" : "i"}
          </span>
          <span className="toast-message">{toast.message}</span>
          {toast.type === "loading" ? (
            <span className="toast-progress" role="progressbar" aria-label="Action in progress" />
          ) : (
            <button
              className="toast-dismiss"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => {
                window.clearTimeout(toastTimer.current);
                setToast(null);
              }}
            >×</button>
          )}
        </div>
      )}
      <section className={`assistant-panel${assistantOpen ? " open" : ""}`} aria-label="Personal assistant" aria-hidden={!assistantOpen}>
        <header className="assistant-header">
          <span className="assistant-avatar" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 4v4M13.5 4h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="5" y="9" width="22" height="17" rx="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M11 16h.1m9.8 0h.1M12 21h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="assistant-title"><strong>UniRead assistant</strong><span>Here to help you read</span></span>
          <button className="assistant-close" type="button" aria-label="Close assistant" onClick={() => setAssistantOpen(false)}>×</button>
        </header>
        <div className="assistant-messages" ref={assistantMessagesRef} aria-live="polite">
          {assistantMessages.map((message, index) => (
            <div className={`assistant-message ${message.role}`} key={`${index}-${message.role}`}>
              {message.text}
            </div>
          ))}
        </div>
        <form className="assistant-form" onSubmit={sendAssistantMessage}>
          <label className="sr-only" htmlFor="assistant-input">Ask the UniRead assistant</label>
          <input
            id="assistant-input"
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            placeholder="Ask me anything..."
            autoComplete="off"
          />
          <button type="submit" aria-label="Send message" disabled={!assistantInput.trim()}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </section>
      <button
        className={`assistant-launcher${assistantOpen ? " active" : ""}`}
        type="button"
        aria-label={assistantOpen ? "Close personal assistant" : "Open personal assistant"}
        aria-expanded={assistantOpen}
        onClick={() => setAssistantOpen((open) => !open)}
      >
        {assistantOpen ? (
          <span className="assistant-launcher-close" aria-hidden="true">×</span>
        ) : (
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 4v4M13.5 4h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="5" y="9" width="22" height="17" rx="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 16h.1m9.8 0h.1M12 21h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default App;
