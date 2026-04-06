const $ = (sel) => document.querySelector(sel);

const settingsBtn = $("#settingsBtn");
const settingsPanel = $("#settingsPanel");
const mainPanel = $("#mainPanel");
const apiKeyInput = $("#apiKeyInput");
const toggleKey = $("#toggleKey");
const saveKeyBtn = $("#saveKeyBtn");
const keyStatus = $("#keyStatus");
const solveBtn = $("#solveBtn");
const loading = $("#loading");
const result = $("#result");
const answerText = $("#answerText");
const copyBtn = $("#copyBtn");
const errorEl = $("#error");
const errorText = $("#errorText");
const notOnDuolingo = $("#notOnDuolingo");
const noApiKey = $("#noApiKey");

let isOnDuolingo = false;
let hasApiKey = false;

async function checkTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  isOnDuolingo = tab?.url?.includes("duolingo.com") ?? false;

  if (isOnDuolingo) {
    notOnDuolingo.classList.add("hidden");
  } else {
    notOnDuolingo.classList.remove("hidden");
  }

  solveBtn.disabled = !isOnDuolingo || !hasApiKey;
}

async function init() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  hasApiKey = !!apiKey;

  if (!hasApiKey) {
    noApiKey.classList.remove("hidden");
    settingsPanel.classList.remove("hidden");
  }

  await checkTab();
}

chrome.tabs.onActivated.addListener(() => checkTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) checkTab();
});

const autoSolveToggle = $("#autoSolveToggle");

chrome.storage.local.get("autoSolve", ({ autoSolve }) => {
  autoSolveToggle.checked = !!autoSolve;
});

autoSolveToggle.addEventListener("change", () => {
  chrome.storage.local.set({ autoSolve: autoSolveToggle.checked });
});

let solving = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "exerciseChanged") {
    result.classList.add("hidden");
    errorEl.classList.add("hidden");
    answerText.innerHTML = "";

    if (autoSolveToggle.checked && !solving) {
      setTimeout(() => {
        if (!solving) solveBtn.click();
      }, 300);
    }
  }
});

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

toggleKey.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = "Please enter a valid key.";
    keyStatus.style.color = "var(--danger)";
    return;
  }

  await chrome.storage.local.set({ apiKey: key });
  hasApiKey = true;
  keyStatus.textContent = "Key saved successfully!";
  keyStatus.style.color = "var(--green)";
  noApiKey.classList.add("hidden");
  solveBtn.disabled = !isOnDuolingo;
  apiKeyInput.value = "";

  setTimeout(() => {
    keyStatus.textContent = "";
    settingsPanel.classList.add("hidden");
  }, 1500);
});

solveBtn.addEventListener("click", async () => {
  if (solving) return;
  solving = true;
  solveBtn.disabled = true;
  result.classList.add("hidden");
  errorEl.classList.add("hidden");
  loading.classList.remove("hidden");

  try {
    const loadingText = $("#loadingText");
    loadingText.textContent = "Capturing screenshot & detecting audio...";
    const { screenshot, transcriptions } = await captureAndTranscribe();
    if (transcriptions.length > 0) {
      loadingText.textContent = `Transcribed ${transcriptions.length} audio clip(s). Solving...`;
    } else {
      loadingText.textContent = "Analyzing exercise...";
    }
    const answer = await solveWithAI(screenshot, transcriptions);
    renderAnswer(answer);
    result.classList.remove("hidden");
  } catch (err) {
    errorText.textContent = err.message;
    errorEl.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
    solveBtn.disabled = false;
    solving = false;
  }
});

copyBtn.addEventListener("click", () => {
  const shortAnswer = $("#shortAnswer");
  navigator.clipboard.writeText(shortAnswer ? shortAnswer.textContent : answerText.textContent);
  copyBtn.title = "Copied!";
  setTimeout(() => { copyBtn.title = "Copy"; }, 1500);
});

function renderAnswer(raw) {
  answerText.innerHTML = "";

  const parsed = parseAnswer(raw);

  if (parsed.type) {
    const typeEl = document.createElement("div");
    typeEl.className = "answer-type";
    typeEl.textContent = parsed.type;
    answerText.appendChild(typeEl);
  }

  if (parsed.answer) {
    const ansEl = document.createElement("div");
    ansEl.id = "shortAnswer";
    ansEl.className = "answer-short";
    ansEl.textContent = parsed.answer;
    answerText.appendChild(ansEl);
  }

  if (parsed.howToInput) {
    const howEl = document.createElement("div");
    howEl.className = "answer-how";
    howEl.textContent = parsed.howToInput;
    answerText.appendChild(howEl);
  }

  if (parsed.details) {
    const details = document.createElement("details");
    details.className = "answer-details";
    const summary = document.createElement("summary");
    summary.textContent = "Show details";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "answer-details-body";
    body.textContent = parsed.details;
    details.appendChild(body);
    answerText.appendChild(details);
  }

  if (!parsed.answer && !parsed.type) {
    answerText.textContent = raw;
  }
}

function parseAnswer(text) {
  const result = { type: "", answer: "", howToInput: "", details: "" };
  const lines = text.split("\n");
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^📝\s*EXERCISE TYPE:/i.test(trimmed)) {
      result.type = trimmed.replace(/^📝\s*EXERCISE TYPE:\s*/i, "").trim();
    } else if (/^✅\s*CORRECT ANSWER:/i.test(trimmed)) {
      currentSection = "answer";
      const val = trimmed.replace(/^✅\s*CORRECT ANSWER:\s*/i, "").trim();
      if (val) result.answer = val;
    } else if (/^🎯\s*HOW TO INPUT:/i.test(trimmed)) {
      currentSection = "how";
      const val = trimmed.replace(/^🎯\s*HOW TO INPUT:\s*/i, "").trim();
      if (val) result.howToInput = val;
    } else if (/^(📋|💡)/.test(trimmed)) {
      currentSection = "details";
      sections.push(trimmed);
    } else if (trimmed) {
      if (currentSection === "answer" && !result.answer) {
        result.answer = trimmed;
        currentSection = null;
      } else if (currentSection === "how") {
        result.howToInput += (result.howToInput ? "\n" : "") + trimmed;
      } else if (currentSection === "details" || currentSection === null) {
        sections.push(trimmed);
      }
    }
  }

  result.details = sections.join("\n");
  return result;
}

function captureAndTranscribe() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "captureAndTranscribe" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else if (response?.screenshot) {
        resolve({
          screenshot: response.screenshot,
          transcriptions: response.transcriptions || []
        });
      } else {
        reject(new Error("Failed to capture screenshot."));
      }
    });
  });
}

const SYSTEM_PROMPT = `You are an expert multilingual Duolingo tutor and exercise solver with deep knowledge of linguistics, grammar, and language pedagogy. You have mastered all languages available on Duolingo.

## Your Task
Analyze the screenshot of a Duolingo exercise with extreme precision and provide the correct solution.

## Exercise Types You Must Recognize
- **Translation** (sentence/phrase from one language to another)
- **Fill in the blank** (complete the missing word/phrase)
- **Word bank / Tap to translate** (select and arrange word tiles)
- **Matching pairs** (match words/phrases across two columns)
- **Listening exercises** (transcribe what you hear — identify from audio waveform/speaker icon)
- **Listening + Matching** (match audio clips to text — audio has been transcribed for you)
- **Speaking exercises** (identify from microphone icon)
- **Select the correct meaning** (multiple choice from images or text)
- **Select all correct translations** (multiple answers may be correct)
- **Complete the conversation / dialogue**
- **Read and respond** (comprehension-based)
- **Stories** (fill in missing parts of a story)
- **Character exercises** (select correct character/script — for CJK, Arabic, etc.)

## Response Format
Structure your answer EXACTLY like this:

📝 EXERCISE TYPE: [identified type]

✅ CORRECT ANSWER: [the exact answer to input/select — this is the most important part]

📋 ALL ACCEPTABLE ANSWERS: [list any alternative correct answers if applicable]

💡 EXPLANATION:
- [Grammar rule or pattern involved]
- [Vocabulary breakdown if helpful]
- [Common mistakes to avoid]

🎯 HOW TO INPUT: [Specific instructions — which tiles to tap, which option to select, what to type, etc.]

## Critical Rules
1. **Accuracy is paramount** — never guess. Analyze every word, tile, image, and UI element in the screenshot.
2. **Identify the source and target languages** from context clues (flags, UI language, exercise instructions).
3. **For word bank exercises**, list the EXACT tiles to tap in the correct order.
4. **For matching exercises**, list each pair explicitly.
5. **For multiple choice**, identify the correct option(s) clearly (e.g., "Option 2" or the exact text).
6. **Consider Duolingo's accepted answers** — Duolingo often accepts multiple valid translations. Provide the most natural/common one first, then alternatives.
7. **Pay attention to accents, diacritics, capitalization, and punctuation** — these matter in Duolingo.
8. **For listening exercises with transcriptions provided**, use the transcriptions to match audio clips to their text counterparts.
9. **If the exercise is partially completed**, account for what's already filled in.
10. **Always give the answer in the format Duolingo expects** — don't add extra words or punctuation that would be marked wrong.`;


function buildUserPrompt(transcriptions) {
  let prompt = `Look at this Duolingo exercise screenshot carefully. Identify every UI element, text, word tile, image, flag, and instruction visible.`;

  if (transcriptions && transcriptions.length > 0) {
    prompt += `\n\n## Audio Transcriptions\nThe following audio clips were detected and transcribed from the exercise:\n`;
    for (const t of transcriptions) {
      prompt += `- Audio button ${t.index}: "${t.transcription}"\n`;
    }
    prompt += `\nUse these transcriptions to match audio clips with their corresponding text options.`;
  }

  prompt += `\n\nProvide:
1. The EXACT correct answer (most important — this must be precisely what the user should type or select)
2. Alternative accepted answers if any
3. Clear explanation of the grammar/vocabulary
4. Step-by-step instructions for how to input the answer in the Duolingo interface

Be thorough and precise. The user needs to get this 100% correct.`;

  return prompt;
}

async function solveWithAI(screenshotDataUrl, transcriptions = []) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("API key not set. Open settings to configure.");

  const userPrompt = buildUserPrompt(transcriptions);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: screenshotDataUrl, detail: "high" } }
          ]
        }
      ],
      max_completion_tokens: 128000
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response from AI.";
}

init();
