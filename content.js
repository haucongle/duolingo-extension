let overlay = null;
let lastChallengeSignature = "";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showAnswer") {
    showOverlay(message.answer);
  }

  if (message.action === "clickAudioButtons") {
    clickAudioButtonsSequentially().then(sendResponse);
    return true;
  }
});

function getChallengeSignature() {
  const challenge = document.querySelector('[data-test*="challenge"]');
  if (!challenge) return "";
  const heading = document.querySelector('h1, [data-test="challenge-header"]');
  const tokens = document.querySelectorAll('[data-test="challenge-tap-token-text"]');
  const choices = document.querySelectorAll('[data-test="challenge-choice"]');
  const textArea = document.querySelector('[data-test="challenge-translate-input"]');
  const parts = [
    heading?.textContent || "",
    [...tokens].map(t => t.textContent).join("|"),
    [...choices].map(c => c.textContent).join("|"),
    textArea?.value || "",
    challenge.children.length
  ];
  return parts.join(":::");
}

function watchForExerciseChanges() {
  const target = document.querySelector('#root') || document.body;
  lastChallengeSignature = getChallengeSignature();

  const observer = new MutationObserver(() => {
    const newSig = getChallengeSignature();
    if (newSig && newSig !== lastChallengeSignature) {
      lastChallengeSignature = newSig;
      removeOverlay();
      chrome.runtime.sendMessage({ action: "exerciseChanged" });
    }
  });

  observer.observe(target, { childList: true, subtree: true });
}

watchForExerciseChanges();

async function clickAudioButtonsSequentially() {
  const buttons = findAudioButtons();
  const clicked = [];

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].click();
    clicked.push(i + 1);
    await sleep(800);
  }

  return { clickedCount: clicked.length, buttonIndices: clicked };
}

function findAudioButtons() {
  const found = [];

  // Strategy 1: Duolingo's data-test="challenge-tap-token" with audio inside
  document.querySelectorAll('[data-test="challenge-tap-token"]').forEach(token => {
    const hasSpeaker = token.querySelector('[data-test="speaker-button"]') ||
                       token.querySelector('svg');
    const hasNoText = !token.querySelector('[data-test="challenge-tap-token-text"]')?.textContent?.trim();
    if (hasSpeaker && hasNoText) {
      const btn = token.querySelector('button') || token;
      found.push(btn);
    }
  });

  if (found.length > 0) return found;

  // Strategy 2: Look for speaker-button test attributes
  const speakerBtns = document.querySelectorAll('[data-test="speaker-button"]');
  if (speakerBtns.length > 0) return [...speakerBtns];

  // Strategy 3: Find buttons in the challenge area that have audio waveform SVGs but no readable text
  const challengeArea = document.querySelector('[data-test*="challenge"]') ||
                        document.querySelector('[class*="challenge"]') ||
                        document.querySelector('main');

  if (challengeArea) {
    challengeArea.querySelectorAll('button').forEach(btn => {
      const rect = btn.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      const hasSvg = btn.querySelector('svg');
      const textContent = btn.textContent?.replace(/\d+/g, '').trim();
      const looksLikeAudio = hasSvg && textContent.length === 0;

      if (looksLikeAudio) {
        found.push(btn);
      }
    });
  }

  if (found.length > 0) return found;

  // Strategy 4: Broadest - any visible button with an SVG speaker icon and no text
  document.querySelectorAll('button').forEach(btn => {
    const rect = btn.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return;
    if (rect.top < 0 || rect.top > window.innerHeight) return;

    const svgs = btn.querySelectorAll('svg');
    if (svgs.length === 0) return;

    const visibleText = btn.textContent?.replace(/\s+/g, '').replace(/\d+/g, '');
    if (visibleText.length === 0) {
      found.push(btn);
    }
  });

  return found;
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
