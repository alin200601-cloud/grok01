# grok01

A small Grok-style web chat: FastAPI backend, static frontend, streaming from xAI.

## Prerequisites

- Python 3.10+
- An xAI API key from [https://console.x.ai/](https://console.x.ai/)

## Setup

```
cd grok01
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then paste XAI_API_KEY
uvicorn app:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000)

## Model

Uses **grok-4.6** (xAI flagship as of August 2026) via the OpenAI-compatible Chat Completions API at `https://api.x.ai/v1`. Streaming is SSE: each token arrives as `data: {"delta": "..."}`, ending with `data: [DONE]`.

Do not commit `.env`. Copy `.env.example` and keep your key local.
