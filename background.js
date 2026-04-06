chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "solve-exercise") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url?.includes("duolingo.com")) {
      const { screenshot, transcriptions } = await captureAndTranscribe(tab.id);
      const result = await analyzeScreenshot(screenshot, transcriptions);
      chrome.tabs.sendMessage(tab.id, { action: "showAnswer", answer: result });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureAndTranscribe") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab found.");
        const result = await captureAndTranscribe(tab.id);
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "captureTab") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab found.");
        const screenshot = await captureWithDebugger(tab.id);
        sendResponse({ screenshot });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});

async function captureAndTranscribe(tabId) {
  const target = { tabId };

  // Attach debugger once for both screenshot and network interception
  await new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  let screenshot;
  let transcriptions = [];

  try {
    // 1. Capture screenshot
    const ssResult = await sendDebuggerCommand(tabId, "Page.captureScreenshot", {
      format: "png", quality: 100, fromSurface: true
    });
    screenshot = "data:image/png;base64," + ssResult.data;

    // 2. Enable network monitoring to intercept audio file requests
    await sendDebuggerCommand(tabId, "Network.enable");

    const audioUrls = [];
    const audioListener = (source, method, params) => {
      if (source.tabId !== tabId || method !== "Network.requestWillBeSent") return;
      const url = params.request?.url || "";
      if (isAudioUrl(url) && !audioUrls.includes(url)) {
        audioUrls.push(url);
      }
    };

    chrome.debugger.onEvent.addListener(audioListener);

    try {
      // 3. Tell content script to click audio buttons
      const clickResult = await sendTabMessage(tabId, { action: "clickAudioButtons" });

      // 4. Wait a bit for any remaining network requests
      if (clickResult?.clickedCount > 0) {
        await sleep(500);
      }
    } catch (e) {
      // Content script not available or no buttons found
    }

    chrome.debugger.onEvent.removeListener(audioListener);
    await sendDebuggerCommand(tabId, "Network.disable");

    // 5. Transcribe collected audio URLs
    if (audioUrls.length > 0) {
      const sources = audioUrls.map((url, i) => ({
        index: i + 1,
        label: `Audio ${i + 1}`,
        url
      }));
      transcriptions = await transcribeAllAudio(sources);
    }
  } finally {
    chrome.debugger.detach(target, () => {});
  }

  return { screenshot, transcriptions };
}

function isAudioUrl(url) {
  if (!url || url.startsWith('data:')) return false;
  const lower = url.toLowerCase();

  const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.webm', '.opus', '.flac'];
  if (audioExtensions.some(ext => lower.includes(ext))) return true;

  // Duolingo CDN patterns for audio
  if (lower.includes('d1vq87e9lcf771.cloudfront.net')) return true;
  if (lower.includes('d35aaqx5ub95lt.cloudfront.net') && lower.includes('audio')) return true;
  if (lower.includes('duolingo') && (lower.includes('tts') || lower.includes('audio'))) return true;

  if (lower.includes('/audio/') || lower.includes('/tts/') || lower.includes('/sound/')) return true;

  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// --- Debugger-based screenshot ---

function sendDebuggerCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function captureWithDebugger(tabId) {
  const target = { tabId };

  await new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });

  try {
    const result = await sendDebuggerCommand(tabId, "Page.captureScreenshot", {
      format: "png",
      quality: 100,
      fromSurface: true
    });
    return "data:image/png;base64," + result.data;
  } finally {
    chrome.debugger.detach(target, () => {});
  }
}

// --- Whisper transcription ---

async function transcribeAllAudio(audioSources) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) return [];

  const results = [];
  for (const source of audioSources) {
    try {
      const text = await transcribeAudioUrl(source.url, apiKey);
      results.push({
        index: source.index,
        label: source.label,
        transcription: text
      });
    } catch (e) {
      results.push({
        index: source.index,
        label: source.label,
        transcription: `[transcription failed: ${e.message}]`
      });
    }
  }
  return results;
}

async function transcribeAudioUrl(url, apiKey) {
  const audioResponse = await fetch(url);
  if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.status}`);

  const audioBlob = await audioResponse.blob();

  const ext = url.includes(".mp3") ? "mp3" : url.includes(".ogg") ? "ogg" : "mp3";
  const audioFile = new File([audioBlob], `audio.${ext}`, { type: audioBlob.type || `audio/${ext}` });

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Whisper API error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || "";
}

// --- AI analysis ---

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

🎯 HOW TO INPUT: [Specific instructions — which tiles to tap, which option to select, what to type, which pairs to match, etc.]

## Critical Rules
1. **Accuracy is paramount** — never guess. Analyze every word, tile, image, and UI element in the screenshot.
2. **Identify the source and target languages** from context clues (flags, UI language, exercise instructions).
3. **For word bank exercises**, list the EXACT tiles to tap in the correct order.
4. **For matching exercises**, list each pair explicitly (e.g., "1 ↔ 6, 2 ↔ 5").
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

async function analyzeScreenshot(screenshotDataUrl, transcriptions = []) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    throw new Error("API key not configured. Click the extension icon to set it up.");
  }

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
            {
              type: "image_url",
              image_url: {
                url: screenshotDataUrl,
                detail: "high"
              }
            }
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
