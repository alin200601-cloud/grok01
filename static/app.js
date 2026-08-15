const thread = document.getElementById("thread");
const messagesEl = document.getElementById("messages");
const emptyEl = document.getElementById("empty");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const banner = document.getElementById("banner");

const messages = [];
let streaming = false;

function showBanner(text) {
  banner.hidden = !text;
  banner.textContent = text || "";
}

function hideEmpty() {
  emptyEl.classList.add("hidden");
}

function scrollToBottom() {
  thread.scrollTop = thread.scrollHeight;
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function appendMessage(role, content) {
  hideEmpty();
  const wrap = document.createElement("article");
  wrap.className = `msg ${role}`;
  const roleEl = document.createElement("div");
  roleEl.className = "role";
  roleEl.textContent = role === "user" ? "You" : "Grok";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  wrap.append(roleEl, bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function parseSseChunk(buffer, onEvent) {
  const parts = buffer.split("\n");
  const rest = parts.pop();
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data) onEvent(data);
  }
  return rest;
}

async function sendChat() {
  const text = input.value.trim();
  if (!text || streaming) return;

  showBanner("");
  messages.push({ role: "user", content: text });
  appendMessage("user", text);
  input.value = "";
  resizeInput();

  streaming = true;
  sendBtn.disabled = true;
  input.disabled = true;

  const assistantEl = appendMessage("assistant", "");
  assistantEl.classList.add("streaming");
  const bubble = assistantEl.querySelector(".bubble");
  let assistantText = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok && !contentType.includes("text/event-stream")) {
      let detail = `Request failed (${res.status})`;
      try {
        const payload = await res.json();
        if (payload && payload.error) detail = payload.error;
      } catch {
        /* keep status text */
      }
      throw new Error(detail);
    }

    if (!res.body) throw new Error("No response stream from the server.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (data) => {
        if (data === "[DONE]") return;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
        if (parsed.error) {
          streamError = parsed.error;
          return;
        }
        if (typeof parsed.delta === "string") {
          assistantText += parsed.delta;
          bubble.textContent = assistantText;
          scrollToBottom();
        }
      });
    }

    if (buffer.trim()) {
      parseSseChunk(buffer + "\n", (data) => {
        if (data === "[DONE]") return;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
        if (parsed.error) {
          streamError = parsed.error;
          return;
        }
        if (typeof parsed.delta === "string") {
          assistantText += parsed.delta;
          bubble.textContent = assistantText;
          scrollToBottom();
        }
      });
    }

    if (streamError) throw new Error(streamError);
    if (!assistantText) throw new Error("The model returned an empty response.");

    messages.push({ role: "assistant", content: assistantText });
  } catch (err) {
    const message = err && err.message ? err.message : "Something went wrong.";
    showBanner(message);
    if (!assistantText) {
      assistantEl.remove();
      if (!messagesEl.children.length) emptyEl.classList.remove("hidden");
    } else {
      messages.push({ role: "assistant", content: assistantText });
    }
  } finally {
    assistantEl.classList.remove("streaming");
    streaming = false;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChat();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChat();
  }
});

input.addEventListener("input", resizeInput);
resizeInput();
input.focus();
