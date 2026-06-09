const $ = (sel) => document.querySelector(sel);

const settingsBtn = $("#settingsBtn");
const settingsPanel = $("#settingsPanel");
const mainPanel = $("#mainPanel");
const providerSelect = $("#providerSelect");
const apiKeyInput = $("#apiKeyInput");
const apiKeyLabel = $("#apiKeyLabel");
const footerText = $("#footerText");
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

const PROVIDERS = {
  openai: {
    label: "OpenAI API Key",
    placeholder: "sk-...",
    footer: "Powered by GPT-5.4 Vision",
    keyName: "openaiKey"
  },
  anthropic: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    footer: "Powered by Claude Vision",
    keyName: "anthropicKey"
  }
};

let provider = "openai";

function providerConfig() {
  return PROVIDERS[provider] || PROVIDERS.openai;
}

async function getActiveKey() {
  const cfg = providerConfig();
  const data = await chrome.storage.local.get(cfg.keyName);
  return data[cfg.keyName] || "";
}

async function applyProviderUI() {
  const cfg = providerConfig();
  providerSelect.value = provider;
  apiKeyLabel.textContent = cfg.label;
  footerText.textContent = cfg.footer;
  const savedKey = await getActiveKey();
  hasApiKey = !!savedKey;
  apiKeyInput.value = "";
  apiKeyInput.placeholder = savedKey ? "•••••••• (saved)" : cfg.placeholder;
}

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
  const stored = await chrome.storage.local.get(["provider", "apiKey", "openaiKey"]);

  // Migrate legacy single-key storage to per-provider storage.
  if (stored.apiKey && !stored.openaiKey) {
    await chrome.storage.local.set({ openaiKey: stored.apiKey });
    await chrome.storage.local.remove("apiKey");
  }

  provider = stored.provider === "anthropic" ? "anthropic" : "openai";
  await applyProviderUI();

  if (!hasApiKey) {
    noApiKey.classList.remove("hidden");
    settingsPanel.classList.remove("hidden");
  }

  await checkTab();

  const { pendingSolve } = await chrome.storage.local.get("pendingSolve");
  if (pendingSolve) {
    await chrome.storage.local.remove("pendingSolve");
    if (!solving && !solveBtn.disabled) {
      solveBtn.click();
    }
  }
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

chrome.storage.onChanged.addListener((changes) => {
  if (changes.exerciseChanged?.newValue) {
    chrome.storage.local.remove("exerciseChanged");
    result.classList.add("hidden");
    errorEl.classList.add("hidden");
    answerText.innerHTML = "";

    if (autoSolveToggle.checked && !solving && !solveBtn.disabled) {
      solveBtn.click();
    }
  }

  if (changes.pendingSolve?.newValue) {
    chrome.storage.local.remove("pendingSolve");
    if (!solving && !solveBtn.disabled) {
      solveBtn.click();
    }
  }
});

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

toggleKey.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

providerSelect.addEventListener("change", async () => {
  provider = providerSelect.value === "anthropic" ? "anthropic" : "openai";
  await chrome.storage.local.set({ provider });
  await applyProviderUI();
  keyStatus.textContent = "";
  noApiKey.classList.toggle("hidden", hasApiKey);
  solveBtn.disabled = !isOnDuolingo || !hasApiKey;
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = "Please enter a valid key.";
    keyStatus.style.color = "var(--danger)";
    return;
  }

  await chrome.storage.local.set({ [providerConfig().keyName]: key });
  hasApiKey = true;
  keyStatus.textContent = "Key saved successfully!";
  keyStatus.style.color = "var(--green)";
  noApiKey.classList.add("hidden");
  solveBtn.disabled = !isOnDuolingo;
  apiKeyInput.value = "";
  apiKeyInput.placeholder = "•••••••• (saved)";

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
    loadingText.textContent = "Capturing screenshot...";
    const screenshot = await captureTab();
    loadingText.textContent = "Analyzing exercise...";
    const answer = await solveWithAI(screenshot);
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

  if (parsed.answer) {
    const ansEl = document.createElement("div");
    ansEl.id = "shortAnswer";
    ansEl.className = "answer-short";
    ansEl.textContent = parsed.answer;
    answerText.appendChild(ansEl);
  }

  const rest = [parsed.type, parsed.howToInput, parsed.details].filter(Boolean).join("\n\n");
  if (rest) {
    const details = document.createElement("details");
    details.className = "answer-details";
    const summary = document.createElement("summary");
    summary.textContent = "More";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "answer-details-body";
    body.textContent = rest;
    details.appendChild(body);
    answerText.appendChild(details);
  }

  if (!parsed.answer) {
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

function captureTab() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else if (response?.screenshot) {
        resolve(response.screenshot);
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

✅ CORRECT ANSWER: [Give ONLY what the user needs to do, based on exercise type:
  - Fill-in-the-blank/word bank: list the tiles in order, comma-separated (e.g., "you have, you")
  - Multiple choice / Complete the conversation: the option number and text (e.g., "2. I think you should apologize.")
  - Translation / Typing: the exact text to type
  - Matching: list each pair (e.g., "dog = chien, cat = chat")
  - Select all correct: list all correct options]

📋 ALL ACCEPTABLE ANSWERS: [list any alternative correct answers if applicable]

💡 EXPLANATION:
- [Grammar rule or pattern involved]
- [Vocabulary breakdown if helpful]
- [Common mistakes to avoid]

🎯 HOW TO INPUT: [Specific instructions — which tiles to tap, which option to select, what to type, etc.]

## Critical Rules
1. **Accuracy is paramount** — never guess. Analyze every word, tile, image, and UI element in the screenshot.
2. **Identify the source and target languages** from context clues (flags, UI language, exercise instructions).
3. **For word bank / fill-in-the-blank exercises**: First identify ALL available word tiles. A tile may contain multiple words (e.g., "we have" is ONE tile). List which tile goes in which blank, in order, comma-separated.
4. **For matching exercises**, list each pair explicitly.
5. **For multiple choice**, identify the correct option(s) clearly (e.g., "Option 2" or the exact text).
6. **Consider Duolingo's accepted answers** — Duolingo often accepts multiple valid translations. Provide the most natural/common one first, then alternatives.
7. **Pay attention to accents, diacritics, capitalization, and punctuation** — these matter in Duolingo.
8. **For listening exercises**, note that you cannot hear audio — analyze any visible text, hints, or word tiles to determine the answer. If audio-only with no text clues, say so briefly.
9. **If the exercise is partially completed**, account for what's already filled in.
10. **Always give the answer in the format Duolingo expects** — don't add extra words or punctuation that would be marked wrong.`;


const USER_PROMPT = `Look at this Duolingo exercise screenshot carefully.

STEP 1: Identify the exercise type.
STEP 2: If there are word tiles/word bank at the bottom of the screen, list EVERY tile exactly as shown. Each rounded rectangle is ONE tile — it may contain multiple words (e.g., "he have" is a single tile, NOT two tiles "he" and "have").
STEP 3: You have exactly those tiles to fill the blanks. Each tile is used AT MOST once. Every blank must be filled. Figure out which tile goes in which blank by reading the full sentence grammatically.

Example: If tiles are ["he", "he have"] and sentence is "Should ___ speak? Should ___ spoken?", the answer is: he, he have (because "Should he have spoken" is grammatically correct).

For multiple choice (numbered options 1, 2, etc.): just pick the correct option number and text.
For typing exercises: give the exact text to type.

Be thorough and precise. The user needs to get this 100% correct.`;

async function solveWithAI(screenshotDataUrl) {
  const apiKey = await getActiveKey();
  if (!apiKey) throw new Error("API key not set. Open settings to configure.");

  return provider === "anthropic"
    ? solveWithAnthropic(apiKey, screenshotDataUrl)
    : solveWithOpenAI(apiKey, screenshotDataUrl);
}

async function solveWithOpenAI(apiKey, screenshotDataUrl) {
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
            { type: "text", text: USER_PROMPT },
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

async function solveWithAnthropic(apiKey, screenshotDataUrl) {
  const match = /^data:(image\/\w+);base64,(.*)$/.exec(screenshotDataUrl);
  const mediaType = match ? match[1] : "image/png";
  const base64Data = match ? match[2] : screenshotDataUrl.replace(/^data:[^,]*,/, "");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || "No response from AI.";
}

init();
