let overlay = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showAnswer") {
    showOverlay(message.answer);
  }
});

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
