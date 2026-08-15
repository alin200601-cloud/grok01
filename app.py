import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI, APIError

load_dotenv()

MODEL = "grok-4.6"
MAX_HISTORY = 40
SYSTEM_PROMPT = (
    "You are Grok, a helpful, witty, maximally truthful assistant from xAI. "
    "Be concise unless asked for depth."
)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

app = FastAPI(title="grok01")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.post("/api/chat")
async def chat(request: Request):
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        return JSONResponse(
            status_code=500,
            content={
                "error": (
                    "XAI_API_KEY is not set. Copy .env.example to .env and paste "
                    "your key from https://console.x.ai/"
                )
            },
        )

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body."})

    raw_messages = body.get("messages")
    if not isinstance(raw_messages, list):
        return JSONResponse(
            status_code=400,
            content={"error": "Body must include a 'messages' array."},
        )

    messages = []
    for item in raw_messages[-MAX_HISTORY:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant", "system") and isinstance(content, str):
            messages.append({"role": role, "content": content})

    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}, *messages]
    client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")

    def generate():
        try:
            stream = client.chat.completions.create(
                model=MODEL,
                messages=full_messages,
                stream=True,
            )
            for chunk in stream:
                choices = chunk.choices or []
                if not choices:
                    continue
                delta = choices[0].delta.content
                if delta:
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except APIError as exc:
            message = exc.message or str(exc)
            yield f"data: {json.dumps({'error': message}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
