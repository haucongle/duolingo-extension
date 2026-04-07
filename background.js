chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.contextMenus.create({
    id: "duo-solve",
    title: "Solve with Duo AI",
    contexts: ["page"],
    documentUrlPatterns: ["https://www.duolingo.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "duo-solve" && tab) {
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "triggerSolve" }).catch(() => {});
    }, 300);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "solve-exercise") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});

    if (tab.url?.includes("duolingo.com")) {
      chrome.runtime.sendMessage({ action: "triggerSolve" }).catch(() => {});
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message.action === "exerciseChanged") {
    chrome.runtime.sendMessage({ action: "exerciseChanged" }).catch(() => {});
    return;
  }
});

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
