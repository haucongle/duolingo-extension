# Duolingo AI Solver

A Chrome extension that captures Duolingo exercises and uses GPT-5.4 Vision + Whisper to provide instant answers and explanations — including listening exercises.

## Features

- **Side Panel UI** — Opens in Chrome's sidebar, stays visible while you learn
- **AI-Powered Solving** — Uses OpenAI GPT-5.4 Vision to analyze and solve exercises
- **Audio Transcription** — Detects audio clips and transcribes them with OpenAI Whisper for listening/matching exercises
- **Multiple Exercise Types** — Translation, matching, fill-in-the-blank, listening, word bank, stories, and more
- **Keyboard Shortcut** — Press `Alt+S` to capture and solve without opening the side panel
- **In-Page Overlay** — Answers also appear directly on the Duolingo page
- **Light Theme** — Clean, modern UI that matches Duolingo's aesthetic
- **Chrome Debugger Capture** — Reliable screenshot capture via Chrome DevTools Protocol

## Setup

### 1. Install the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `duolingo-extension` folder

### 2. Configure API Key

1. Click the extension icon in Chrome toolbar to open the side panel
2. Click the settings gear icon
3. Enter your [OpenAI API key](https://platform.openai.com/api-keys)
4. Click **Save Key**

> You need an OpenAI API key with access to `gpt-5.4` and `whisper-1` models.

## Usage

1. Navigate to a Duolingo lesson
2. Click the extension icon to open the side panel
3. Press **Capture & Solve**
4. Or press `Alt+S` anywhere on Duolingo to get an answer overlay

For listening exercises, the extension automatically:
- Detects audio buttons on the page
- Fetches preloaded audio files from Duolingo's CDN
- Transcribes each clip with Whisper
- Includes transcriptions in the AI analysis for accurate matching

## How It Works

1. Attaches Chrome Debugger (CDP) to capture a screenshot of the active tab
2. Scans the page for audio resources using Performance API, Howler.js inspection, and React fiber traversal
3. Fetches audio files from the page context and transcribes them with OpenAI Whisper
4. Sends screenshot + transcriptions to GPT-5.4 Vision API
5. AI identifies the exercise type, determines the correct answer, and provides step-by-step instructions

## Tech Stack

- Chrome Extension Manifest V3
- Chrome DevTools Protocol (CDP) for screenshot capture
- OpenAI GPT-5.4 Vision API
- OpenAI Whisper API for audio transcription
- Vanilla HTML/CSS/JS (no build step required)

## Privacy

- Your API key is stored locally in Chrome's extension storage
- Screenshots and audio are sent directly to OpenAI's API and are not stored by the extension
- No data is collected or sent to any third-party servers

## License

MIT
