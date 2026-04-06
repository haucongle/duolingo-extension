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
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a Duolingo exercise solver. Analyze the screenshot and provide:
1. Exercise type (translate, match, fill-in-the-blank, listening, etc.)
2. The correct answer(s)
3. Brief explanation (grammar/vocabulary notes)

Be concise and accurate. If you can't determine the exercise, say so.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Solve this Duolingo exercise. Provide the correct answer and a brief explanation." },
            { type: "image_url", image_url: { url: screenshotDataUrl, detail: "high" } }
          ]
        }
      ],
      max_tokens: 1000
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
