# AI integration (plug-and-play)

The extension only calls **`POST /chat`** and **`GET /ai/status`**. Vendor logic lives under `src/ai/`.

## Configure OpenAI (default)

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1024
```

Restart `npm run dev`. Check:

```bash
curl http://localhost:3001/ai/status
# {"provider":"openai","configured":true,"openai":true}
```

## Swap vendor later

1. Implement `ChatProvider` in `src/ai/providers/your-vendor.ts`
2. Register it in `src/ai/factory.ts` (e.g. `AI_PROVIDER=gemini`)
3. No frontend changes

## API contract (stable)

### `POST /chat`

Request:

```json
{
  "schemaVersion": "1",
  "extractorVersion": "1.0.0",
  "pageContextId": "pc_...",
  "selectionContextId": "sel_...",
  "message": "What is this?"
}
```

Response:

```json
{
  "reply": "...",
  "pageContextId": "pc_...",
  "selectionContextId": "sel_...",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

### `GET /ai/status`

```json
{ "provider": "openai", "configured": true, "openai": true }
```
