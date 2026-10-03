# pin-pum-hello

Small Node server with a prompt box that talks to Grok through the official SpaceXAI TypeScript SDK, [`@xai-official/sdk`](https://github.com/xai-org/xai-sdk-ts). Text chat, text-to-speech, and image generation all stay on the server so the API key never reaches the browser.

## Setup

Node 22.13 or newer. If Node lives under `~/.local/node/current`, put that `bin` directory on `PATH`.

```bash
export PATH="$HOME/.local/node/current/bin:$PATH"
export XAI_API_KEY="your key from console.x.ai"   # never commit this
npm install
npm start
```

Open http://127.0.0.1:8787 . `npm run dev` restarts the server on file changes. Set `PORT` to change the listen port. Optional overrides: `XAI_MODEL` (default `grok-4.7`), `XAI_IMAGE_MODEL` (default `grok-imagine-image-2.0`), `XAI_VOICE` (default `eve`).

Put the key in a local `.env` if you like. That file is gitignored and is not loaded automatically; export it in the shell before `npm start`.

## Chat API

```bash
curl -s http://127.0.0.1:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello in one short sentence."}'
```

`POST /api/chat` expects JSON `{ "prompt": "..." }` and returns `{ "reply", "model" }`.

## Voice

`POST /api/voice` expects JSON `{ "text": "...", "voice_id": "eve", "language": "en" }`. `voice_id` and `language` are optional. The response is an MP3 (`audio/mpeg`) from `client.voice.speak`, same pattern as a short text-to-speech call. The page can speak the latest chat reply (checkbox or the Speak button) and play that MP3.

```bash
curl -s http://127.0.0.1:8787/api/voice \
  -H 'content-type: application/json' \
  -d '{"text":"Hello from pin pum."}' \
  -o reply.mp3
```

## Image

`POST /api/image` expects JSON `{ "prompt": "..." }` and returns `{ "url", "model" }`. The URL is a temporary image link from `client.images.generate`. The page shows it in an `<img>`.

```bash
curl -s http://127.0.0.1:8787/api/image \
  -H 'content-type: application/json' \
  -d '{"prompt":"A small paper boat on a quiet lake at dusk."}'
```
