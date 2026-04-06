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

async function init() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  hasApiKey = !!apiKey;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  isOnDuolingo = tab?.url?.includes("duolingo.com") ?? false;

  if (!hasApiKey) {
    noApiKey.classList.remove("hidden");
    settingsPanel.classList.remove("hidden");
  }

  if (!isOnDuolingo) {
    notOnDuolingo.classList.remove("hidden");
  }

  solveBtn.disabled = !isOnDuolingo || !hasApiKey;
}

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
  solveBtn.disabled = true;
  result.classList.add("hidden");
  errorEl.classList.add("hidden");
  loading.classList.remove("hidden");

  try {
    const screenshot = await captureTab();
    const answer = await solveWithAI(screenshot);
    answerText.textContent = answer;
    result.classList.remove("hidden");
  } catch (err) {
    errorText.textContent = err.message;
    errorEl.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
    solveBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(answerText.textContent);
  copyBtn.title = "Copied!";
  setTimeout(() => { copyBtn.title = "Copy"; }, 1500);
});

function captureTab() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
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
8. **For listening exercises**, note that you cannot hear audio but analyze any visible text, transcript hints, or word bank tiles to determine the answer.
9. **If the exercise is partially completed**, account for what's already filled in.
10. **Always give the answer in the format Duolingo expects** — don't add extra words or punctuation that would be marked wrong.`;

const USER_PROMPT = `Look at this Duolingo exercise screenshot carefully. Identify every UI element, text, word tile, image, flag, and instruction visible.

Provide:
1. The EXACT correct answer (most important — this must be precisely what the user should type or select)
2. Alternative accepted answers if any
3. Clear explanation of the grammar/vocabulary
4. Step-by-step instructions for how to input the answer in the Duolingo interface

Be thorough and precise. The user needs to get this 100% correct.`;

async function solveWithAI(screenshotDataUrl) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("API key not set. Open settings to configure.");

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
      max_completion_tokens: 2000
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
