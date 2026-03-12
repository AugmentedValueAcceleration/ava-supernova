# Self-Hosting Guide

Run Ava with local models for complete privacy, zero cost, and zero-dependency fallback.

## Overview

Ava works with any model server that exposes an OpenAI-compatible chat completions API. Configure it as a "generic" provider with a custom `baseUrl`.

## Ollama

[Ollama](https://ollama.com) is the easiest way to run local models. It serves an OpenAI-compatible API at `http://localhost:11434/v1` by default.

### Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh    # Linux/macOS
# Windows: download from https://ollama.com/download

# Pull a coding model
ollama pull qwen2.5-coder:32b        # Best local coding model (20GB VRAM)
ollama pull qwen2.5-coder:7b         # Lower VRAM option (5GB)
ollama pull deepseek-coder-v2:16b    # Alternative (10GB VRAM)
ollama pull codellama:34b            # Meta's coding model (20GB VRAM)
```

### Configure Ava

In your Ava config (`~/.ava/config.json`), add a generic provider:

```json
{
  "providers": {
    "generic": {
      "baseUrl": "http://localhost:11434/v1",
      "models": [
        {
          "id": "qwen2.5-coder:32b",
          "name": "Qwen 2.5 Coder 32B",
          "provider": "generic",
          "contextWindow": 32768,
          "maxOutputTokens": 4096,
          "supportsToolCalls": true,
          "supportsStreaming": true
        }
      ]
    }
  },
  "activeModel": "generic:qwen2.5-coder:32b"
}
```

No API key needed — Ollama runs locally without authentication.

### Tool Calling Support

Not all Ollama models support native tool calling. Models that do:

| Model | Tool Calls | Context | VRAM |
|-------|-----------|---------|------|
| `qwen2.5-coder:32b` | Yes | 32K | 20GB |
| `qwen2.5-coder:7b` | Yes | 32K | 5GB |
| `llama3.1:70b` | Yes | 128K | 40GB |
| `llama3.1:8b` | Yes | 128K | 5GB |
| `mistral:7b` | Yes | 32K | 5GB |
| `deepseek-coder-v2:16b` | Limited | 128K | 10GB |
| `codellama:34b` | No | 16K | 20GB |

If a model doesn't support tool calls, set `"supportsToolCalls": false`. Ava will still work but without file editing, bash, git, and other tool-based features.

## LM Studio

[LM Studio](https://lmstudio.ai) provides a GUI for downloading and running models with an OpenAI-compatible server.

### Setup

1. Download and install LM Studio from https://lmstudio.ai
2. Browse and download a model (recommended: Qwen 2.5 Coder or DeepSeek Coder)
3. Go to the **Local Server** tab
4. Load your model and click **Start Server**
5. Note the server address (default: `http://localhost:1234/v1`)

### Configure Ava

```json
{
  "providers": {
    "generic": {
      "baseUrl": "http://localhost:1234/v1",
      "models": [
        {
          "id": "your-model-id",
          "name": "Your Model Name",
          "provider": "generic",
          "contextWindow": 32768,
          "maxOutputTokens": 4096,
          "supportsToolCalls": true,
          "supportsStreaming": true
        }
      ]
    }
  },
  "activeModel": "generic:your-model-id"
}
```

The model ID should match the name shown in LM Studio's model list.

## Other Servers

Any server with an OpenAI-compatible `/v1/chat/completions` endpoint works:

| Server | Default URL | Notes |
|--------|------------|-------|
| [vLLM](https://github.com/vllm-project/vllm) | `http://localhost:8000/v1` | High-throughput inference, GPU optimised |
| [llama.cpp server](https://github.com/ggerganov/llama.cpp) | `http://localhost:8080/v1` | Lightweight, CPU-friendly |
| [text-generation-inference](https://github.com/huggingface/text-generation-inference) | `http://localhost:8080/v1` | HuggingFace's inference server |
| [LocalAI](https://github.com/mudler/LocalAI) | `http://localhost:8080/v1` | Multi-model, OpenAI drop-in |

Configure them all the same way — just change the `baseUrl`.

## Using Local Models as Automatic Failover

The real power of local models is as a zero-dependency fallback. Configure both a cloud provider and a local generic provider:

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-your-key"
    },
    "generic": {
      "baseUrl": "http://localhost:11434/v1",
      "models": [
        {
          "id": "qwen2.5-coder:32b",
          "name": "Qwen 2.5 Coder 32B (Local)",
          "provider": "generic",
          "contextWindow": 32768,
          "maxOutputTokens": 4096,
          "supportsToolCalls": true,
          "supportsStreaming": true
        }
      ]
    }
  },
  "activeModel": "deepseek:deepseek-chat"
}
```

With Ava's resilience system:

1. Requests go to DeepSeek (your primary cloud provider) first
2. If DeepSeek is down (500, 502, 503) or rate-limited (429), Ava automatically fails over to your local Ollama model
3. You see a notification: `⚡ Provider failover: DeepSeek → Custom Provider`
4. When DeepSeek recovers, the circuit breaker re-enables it after 60 seconds

No internet required for the fallback — your local model runs entirely offline.

## Recommended Models for Coding

| Model | Best For | Context | Min VRAM | Quality |
|-------|----------|---------|----------|---------|
| Qwen 2.5 Coder 32B | General coding, tool use | 32K | 20GB | Excellent |
| Qwen 2.5 Coder 7B | Quick tasks, low resources | 32K | 5GB | Good |
| DeepSeek Coder V2 16B | Reasoning, complex logic | 128K | 10GB | Very Good |
| Llama 3.1 70B | Multi-language, long context | 128K | 40GB | Excellent |
| Llama 3.1 8B | Quick tasks, low resources | 128K | 5GB | Good |
| CodeLlama 34B | Code completion | 16K | 20GB | Good |
| Mistral 7B | Fast, versatile | 32K | 5GB | Good |

**Tip:** For the best agentic experience (file editing, bash, git), choose a model that supports tool calling. Qwen 2.5 Coder and Llama 3.1 have the best tool support among local models.

## Troubleshooting

### Connection Refused

```
Error: ECONNREFUSED 127.0.0.1:11434
```

The model server isn't running. Start it:
- Ollama: `ollama serve` (or check if the service is running)
- LM Studio: Open the app, go to Local Server, click Start Server

### Model Not Loading

If Ollama hangs on the first request, the model may still be loading into memory. Large models (32B+) can take 30-60 seconds on first load. Subsequent requests are fast.

### Tool Calling Failures

If Ava keeps failing to use tools with a local model:
1. Check if the model supports tool calling (see table above)
2. Try a larger model — 7B models struggle with complex tool use
3. Set `"supportsToolCalls": false` in the model config to disable tools and use Ava in chat-only mode

### Slow Responses

Local models are CPU/GPU bound. To improve speed:
- Use a quantised model (Q4_K_M or Q5_K_M for GGUF models)
- Ensure GPU offloading is enabled (Ollama does this automatically if GPU is available)
- Reduce context window in config if you don't need the full 128K
- Use a smaller model (7B vs 32B)

### CORS Issues (Remote Server)

If your model server runs on a different machine:
```bash
# Ollama: set allowed origins
OLLAMA_ORIGINS="*" ollama serve

# Or set the specific origin
OLLAMA_ORIGINS="http://your-machine:port" ollama serve
```
