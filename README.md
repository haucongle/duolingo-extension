# Duolingo AI Solver

A Chrome extension that captures Duolingo exercises and uses AI vision (OpenAI or Anthropic) to provide instant answers — with auto-solve for hands-free learning.

## Features

- **Side Panel UI** — Opens in Chrome's sidebar, stays visible while you learn
- **AI-Powered Solving** — Choose between OpenAI GPT-5.4 Vision or Anthropic Claude Vision to analyze and solve exercises
- **Auto-Solve** — Toggle on to automatically solve each new exercise after you click Continue
- **Clean Answer Display** — Shows only the correct answer; exercise type, explanation, and details collapsed under "More"
- **Multiple Exercise Types** — Translation, matching, fill-in-the-blank, listening, word bank, select meaning, stories, and more
- **Keyboard Shortcut** — Press `Alt+S` to open the side panel and solve instantly
- **In-Page Overlay** — Answers also appear directly on the Duolingo page via `Alt+S`
- **Light Theme** — Clean UI that matches Duolingo's aesthetic

## Setup

### 1. Install the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `duolingo-extension` folder

### 2. Configure API Key

1. Click the extension icon in Chrome toolbar to open the side panel
2. Click the settings gear icon
3. Choose your **AI Provider** (OpenAI or Anthropic)
4. Enter the matching API key:
   - [OpenAI API key](https://platform.openai.com/api-keys) — needs access to the `gpt-5.4` model
   - [Anthropic API key](https://console.anthropic.com/settings/keys) — uses the `claude-sonnet-4-5` model
5. Click **Save Key**

> Keys for each provider are stored separately, so you can switch providers without re-entering them.

## Usage

### Manual Mode

1. Navigate to a Duolingo lesson
2. Click the extension icon to open the side panel
3. Press **Capture & Solve**
4. Or press `Alt+S` anywhere on Duolingo

### Auto-Solve Mode

1. Open the side panel and toggle on **Auto-solve next exercise**
2. Click **Capture & Solve** once for the current exercise
3. Answer and click **Continue** — the next exercise solves automatically
4. Repeat: answer, continue, auto-solve, answer, continue...

## How It Works

1. Attaches Chrome Debugger (CDP) to capture a screenshot of the active tab
2. Sends the screenshot to your selected AI vision API (OpenAI or Anthropic)
3. AI identifies the exercise type and determines the correct answer
4. Displays only the answer in the side panel (details available under "More")
5. Content script detects when you click Continue and a new exercise loads, triggering auto-solve

## Tech Stack

- Chrome Extension Manifest V3
- Chrome DevTools Protocol (CDP) for screenshot capture
- OpenAI GPT-5.4 Vision API / Anthropic Claude Vision API
- Vanilla HTML/CSS/JS (no build step required)

## Privacy

- Your API key is stored locally in Chrome's extension storage
- Screenshots are sent directly to your selected provider's API (OpenAI or Anthropic) and are not stored by the extension
- No data is collected or sent to any third-party servers

## License

MIT
