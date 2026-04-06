# Duolingo AI Solver

A Chrome extension that captures Duolingo exercises and uses GPT-4o Vision to provide instant answers and explanations.

## Features

- **Screenshot Capture** — One-click capture of the current Duolingo exercise
- **AI-Powered Solving** — Uses OpenAI GPT-5.4 Vision to analyze and solve exercises
- **Multiple Exercise Types** — Supports translation, matching, fill-in-the-blank, listening, and more
- **Keyboard Shortcut** — Press `Alt+S` to capture and solve without opening the popup
- **In-Page Overlay** — Answers appear directly on the Duolingo page
- **Dark Theme** — Clean, modern UI that matches Duolingo's aesthetic

## Setup

### 1. Install the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `duolingo-extension` folder

### 2. Configure API Key

1. Click the extension icon in Chrome toolbar
2. Click the settings gear icon
3. Enter your [OpenAI API key](https://platform.openai.com/api-keys)
4. Click **Save Key**

> You need an OpenAI API key with access to the `gpt-5.4` model.

## Usage

1. Navigate to a Duolingo lesson
2. Click the extension icon and press **Capture & Solve**
3. Or press `Alt+S` anywhere on Duolingo to get an answer overlay

## How It Works

1. Captures a screenshot of the visible browser tab
2. Sends the screenshot to OpenAI's GPT-5.4 Vision API
3. AI identifies the exercise type, determines the correct answer with detailed reasoning
4. Displays the answer with explanation, alternatives, and input instructions

## Tech Stack

- Chrome Extension Manifest V3
- OpenAI GPT-5.4 Vision API (latest, most capable model)
- Vanilla HTML/CSS/JS (no build step required)

## Privacy

- Your API key is stored locally in Chrome's extension storage
- Screenshots are sent directly to OpenAI's API and are not stored by the extension
- No data is collected or sent to any third-party servers

## License

MIT
