# pin-pum-hello

Small Node server with a prompt box that talks to Grok through the official SpaceXAI TypeScript SDK, [`@xai-official/sdk`](https://github.com/xai-org/xai-sdk-ts).

## Setup

Node 22.13 or newer.

```bash
export XAI_API_KEY="your key from console.x.ai"   # never commit this
npm install
npm start
```

Open http://127.0.0.1:8787 . `npm run dev` restarts the server on file changes. Set `PORT` to change the listen port, or `XAI_MODEL` to override the default `grok-4.7`.

Put the key in a local `.env` if you like. That file is gitignored and is not loaded automatically; export it in the shell before `npm start`.

## Chat API

```bash
curl -s http://127.0.0.1:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello in one short sentence."}'
```

`POST /api/chat` expects JSON `{ "prompt": "..." }` and returns `{ "reply", "model" }`.
