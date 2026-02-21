This is the Vercel AI SDK Data Stream Protocol — not OpenAI SSE format. It's intentional.

┌────────┬────────────────────────────────────┐
│ Prefix │              Meaning               │
├────────┼────────────────────────────────────┤
│ f:     │ Message metadata (message ID)      │
├────────┼────────────────────────────────────┤
│ 0:     │ Text chunk                         │
├────────┼────────────────────────────────────┤
│ e:     │ Step finish event (reason + usage) │
├────────┼────────────────────────────────────┤
│ d:     │ Stream done event                  │
└────────┴────────────────────────────────────┘

The toDataStreamResponse() method in your app/api/chat/route.ts produces this format. It's consumed by the useChat hook from @ai-sdk/react on the frontend, which knows how to parse these prefixes.

The standard OpenAI SSE format (data: {"choices":[{"delta":{"content":"..."}}]}) is what OpenRouter/OpenAI servers send to your backend. Your backend then re-encodes it into the AI SDK format before sending to the browser.

So the flow is:
OpenAI SSE (OpenRouter → your server)  →  AI SDK Data Stream (your server → browser)

If you wanted raw OpenAI SSE passthrough to the browser you'd use toTextStreamResponse() instead, but then useChat wouldn't work — you'd have to parse the SSE manually on the client. The current setup is correct for how the app is built.

❯ why is the vercel ai sdk stream better for client side consumption?

⏺ It carries structured metadata that raw OpenAI SSE doesn't:

Raw OpenAI SSE only gives you text deltas:
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: [DONE]

AI SDK Data Stream multiplexes multiple channels in one response:

┌────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────┐
│          What          │                                         Why it matters                                         │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0: text chunks         │ The actual content                                                                             │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ f: message ID          │ Client can track/deduplicate messages without a separate DB call                               │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2: tool call deltas    │ Streaming tool use — the client can render "calling search..." while it's happening            │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ a: tool results        │ Results arrive inline, no second request needed                                                │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 8: message annotations │ Arbitrary metadata (sources, citations, costs) attached to a message mid-stream                │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ e:/d: finish + usage   │ Token counts arrive with the stream so the client can update usage display immediately         │
├────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3: errors              │ Error arrives as a typed event, not an HTTP 500 after streaming started (headers already sent) │
└────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘

The key problem it solves: once you send HTTP headers and start streaming, you can't change the status code. If an error happens mid-stream with raw SSE, you've already sent 200 OK. The AI SDK error channel (3:) lets you signal failure to
the client even after streaming has begun.

For a pure text-only chatbot with no tools, the difference is minor. But the moment you add tool calls, streaming annotations, or need reliable error handling mid-stream, the multiplexed format is significantly easier to work with on the
client.