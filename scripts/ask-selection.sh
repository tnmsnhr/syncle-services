#!/usr/bin/env bash
# Register a lasso-style selection and ask OpenAI via syncle-services.
# Usage:
#   ./scripts/ask-selection.sh "Your question here?"
# Requires: server running (npm run dev), OPENAI_API_KEY in .env

set -euo pipefail
BASE="${SYNCLE_API_BASE:-http://localhost:3001}"
QUESTION="${1:-What is Circle to Search and how does it work? Summarize in 3 bullet points.}"

if ! command -v python3 >/dev/null; then
  echo "python3 is required"
  exit 1
fi

export SYNCLE_QUESTION="$QUESTION"
export SYNCLE_BASE="$BASE"

python3 <<'PY'
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ["SYNCLE_BASE"]
QUESTION = os.environ["SYNCLE_QUESTION"]

# Your extracted context (Product Hunt — Circle to Search)
CONTEXT = {
    "nearbyText": "Best Products\nLaunches\nNews\nForums\nSubscribe\nSign in\nCircle to Search\nFrom wonder to wisdom, just one drag away.\n4.7\n3 reviews\n793 followers\nVisit website\nAI Chatbots\nChrome Extensions\nSearch\nIt's an extension that let you select what you're curious about and get more info with a simple circling. And you can ask the built-in AI assistant for more insights. It's a new way to search anything in browser without leaving the page or copy-paste.\nOverview\nReviews\nAlternatives\nTeam\nAwards\nMore\nLaunched 2yr ago",
    "ancestorText": "It's an extension that let you select what you're curious about and get more info with a simple circling. And you can ask the built-in AI assistant for more insights. It's a new way to search anything in browser without leaving the page or copy-paste.\nCircle to Search\nFrom wonder to wisdom, just one drag away.\n4.7\n3 reviews\n793 followers\nVisit website\nAI Chatbots\nChrome Extensions\nSearch\nOverview\nReviews\nAlternatives\nTeam\nAwards\nMore\nLaunched 2yr ago\n#1\nDay Rank\nUpvote • 672 points\nFree Options\nLaunch Team\nShow more\nWhat do you think? …\nLogin to comment\nLuke Pioneero\nBiRead\nMaker\n📌\nHey, PHers! 👋\nThanks for stopping by!\nI'm Luke Pioneero. Super excited to announce Circle to Search to you all today!\n🤔Why Circle to Search？\n- Instant AI Searches: Circle for immediate results.\n- Advanced Recognition: Perfect recipe discovery, animal ID, and language insights.\n- Chrome Integration: Works naturally within your browser.\n- Save Time: Perfect for the busy bees!\nIt's great for quick fact-checks, identifying objects, and more. On top of that, it's also perfect for those moments when you're reading an article and come across an unfamiliar term or a product you'd like to know more about.\n💡How to use Circle to Search?\n1. Install the Circle to Search browser extension on your browser.\n2. Pin the browser extension icon from the top right corner of your browser.\n3. Click the browser extensi…",
    "headings": [
        "From wonder to wisdom, just one drag away.",
        "Circle to Search",
        "Similar Products",
    ],
    "pageTitle": "Circle to Search: From wonder to wisdom, just one drag away. | Product Hunt",
    "metaDescription": "It's an extension that let you select what you're curious about and get more info with a simple circling. And you can ask the built-in AI assistant for more insights. It's a new way to search anything in browser without leaving the page or copy-paste.",
    "h1": "Circle to Search",
}

CANONICAL = "https://www.producthunt.com/products/circle-to-search"

page_context = {
    "contextBlock": "\n".join(
        filter(
            None,
            [
                f"Title: {CONTEXT['pageTitle']}",
                f"H1: {CONTEXT['h1']}",
                f"Description: {CONTEXT['metaDescription']}",
                "Domain: www.producthunt.com",
            ],
        )
    ),
    "page": {
        "canonicalUrl": CANONICAL,
        "title": CONTEXT["pageTitle"],
        "domain": "www.producthunt.com",
    },
}

headings_block = "\n".join(f"- {h}" for h in CONTEXT["headings"])
local_context = "\n\n".join(
    filter(
        None,
        [
            f"Headings:\n{headings_block}" if headings_block else "",
            f"Nearby:\n{CONTEXT['nearbyText'][:4000]}",
            f"Surrounding:\n{CONTEXT['ancestorText'][:4000]}",
        ],
    )
)

selection = {
    "localPinId": "manual-ask",
    "userSelection": {
        "text": CONTEXT["metaDescription"],
        "elementTypes": ["p", "div"],
    },
    "localContextBlock": local_context,
    "meta": {
        "extractionStrategy": "text",
        "selectionTier": "medium",
        "estimatedTextTokens": 800,
        "hasImage": False,
    },
}

register_body = {
    "schemaVersion": "1",
    "extractorVersion": "1.0.0",
    "pageFingerprint": "producthunt-circle-to-search-manual",
    "canonicalUrl": CANONICAL,
    "pageContext": page_context,
    "selection": selection,
}


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            elapsed = time.perf_counter() - t0
            return resp.status, json.loads(raw), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - t0
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"error": raw}
        return e.code, payload, elapsed


print("=== Register context ===")
status, reg, reg_s = post("/context/page/register", register_body)
print(f"status={status}  latency={reg_s:.3f}s")
if status != 201:
    print(json.dumps(reg, indent=2))
    sys.exit(1)
print(json.dumps(reg, indent=2))

chat_body = {
    "schemaVersion": "1",
    "extractorVersion": "1.0.0",
    "pageContextId": reg["pageContextId"],
    "selectionContextId": reg["selectionContextId"],
    "message": QUESTION,
}

print(f"\n=== Chat (question: {QUESTION!r}) ===")
status, chat, chat_s = post("/chat", chat_body)
print(f"status={status}  latency={chat_s:.3f}s")
print(json.dumps(chat, indent=2))
if status != 200:
    sys.exit(1)
print(f"\n--- Total wall clock: {reg_s + chat_s:.3f}s (register + chat) ---")
PY
