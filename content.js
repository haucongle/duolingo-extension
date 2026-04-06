let overlay = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showAnswer") {
    showOverlay(message.answer);
  }

  if (message.action === "extractAudio") {
    extractAudioSources().then(sendResponse);
    return true;
  }
});

async function extractAudioSources() {
  const results = [];

  const speakerButtons = document.querySelectorAll(
    '[data-test="speaker-button"], ' +
    'button[class*="_3lUBd"], ' +
    '[data-test*="challenge"] button[aria-label]'
  );

  const challengeButtons = [];
  document.querySelectorAll('[data-test="challenge-tap-token"], [data-test="challenge-choice"]').forEach(el => {
    const btn = el.querySelector('button') || el;
    const speakerBtn = el.querySelector('[data-test="speaker-button"]') ||
                       el.querySelector('button[class*="sound"]') ||
                       el.querySelector('svg') ? btn : null;
    if (speakerBtn) challengeButtons.push(btn);
  });

  const allButtons = speakerButtons.length > 0 ? [...speakerButtons] : challengeButtons;

  if (allButtons.length === 0) {
    const allBtns = document.querySelectorAll('button');
    allBtns.forEach(btn => {
      const hasSpeakerIcon = btn.querySelector('svg path[d*="M3"]') ||
                             btn.querySelector('[class*="speaker"]') ||
                             btn.querySelector('[class*="sound"]') ||
                             btn.querySelector('[class*="audio"]');
      const hasWaveform = btn.textContent === '' && btn.querySelector('svg');
      if (hasSpeakerIcon || hasWaveform) {
        allButtons.push(btn);
      }
    });
  }

  const audiosBefore = new Set(
    [...document.querySelectorAll('audio')].map(a => a.currentSrc || a.src).filter(Boolean)
  );

  for (let i = 0; i < allButtons.length; i++) {
    const btn = allButtons[i];
    const parent = btn.closest('[data-test*="challenge"]') || btn.parentElement;
    const label = parent?.querySelector('[data-test="challenge-tap-token-text"]')?.textContent ||
                  parent?.textContent?.trim()?.substring(0, 50) || `Audio ${i + 1}`;

    btn.click();
    await sleep(600);

    const audiosAfter = document.querySelectorAll('audio');
    let audioUrl = null;

    for (const audio of audiosAfter) {
      const src = audio.currentSrc || audio.src;
      if (src && !audiosBefore.has(src)) {
        audioUrl = src;
        audiosBefore.add(src);
        break;
      }
    }

    if (!audioUrl) {
      for (const audio of audiosAfter) {
        const src = audio.currentSrc || audio.src;
        if (src) {
          audioUrl = src;
          break;
        }
      }
    }

    if (audioUrl) {
      results.push({ index: i + 1, label, url: audioUrl });
    }
  }

  if (results.length === 0) {
    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach((audio, i) => {
      const src = audio.currentSrc || audio.src;
      if (src) {
        results.push({ index: i + 1, label: `Audio ${i + 1}`, url: src });
      }
    });
  }

  return { audioSources: results, hasAudio: results.length > 0 };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showOverlay(answer) {
  removeOverlay();

  overlay = document.createElement("div");
  overlay.id = "duo-ai-overlay";

  const header = document.createElement("div");
  header.className = "duo-ai-header";

  const title = document.createElement("span");
  title.className = "duo-ai-title";
  title.textContent = "AI Answer";

  const closeBtn = document.createElement("button");
  closeBtn.className = "duo-ai-close";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", removeOverlay);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "duo-ai-body";
  body.textContent = answer;

  const actions = document.createElement("div");
  actions.className = "duo-ai-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "duo-ai-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(answer);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "duo-ai-btn duo-ai-btn-ghost";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", removeOverlay);

  actions.appendChild(copyBtn);
  actions.appendChild(dismissBtn);

  overlay.appendChild(header);
  overlay.appendChild(body);
  overlay.appendChild(actions);

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("duo-ai-visible");
  });
}

function removeOverlay() {
  if (overlay) {
    overlay.classList.remove("duo-ai-visible");
    setTimeout(() => {
      overlay?.remove();
      overlay = null;
    }, 200);
  }
}
