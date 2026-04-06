chrome.commands.onCommand.addListener(async (command) => {
  if (command === "solve-exercise") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url?.includes("duolingo.com")) {
      captureAndSolve(tab);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }

  if (message.action === "solveFromContent") {
    handleSolveRequest(message.screenshot, sender.tab?.id).then(sendResponse);
    return true;
  }
});

async function captureAndSolve(tab) {
  const screenshot = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  const result = await analyzeScreenshot(screenshot);
  chrome.tabs.sendMessage(tab.id, {
    action: "showAnswer",
    answer: result
  });
}

async function handleSolveRequest(screenshot, tabId) {
  try {
    const result = await analyzeScreenshot(screenshot);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: "showAnswer", answer: result });
    }
    return { success: true, answer: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function analyzeScreenshot(screenshotDataUrl) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    throw new Error("API key not configured. Click the extension icon to set it up.");
  }

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
          content: `You are a Duolingo exercise solver. Analyze the screenshot of a Duolingo exercise and provide:
1. The type of exercise (translate, match, fill-in-the-blank, listening, speaking, etc.)
2. The correct answer(s)
3. A brief explanation of why this is correct (grammar rules, vocabulary notes)

Be concise and accurate. Format your response clearly with sections.
If you cannot determine the exercise or answer, say so honestly.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Solve this Duolingo exercise. Provide the correct answer and a brief explanation."
            },
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
