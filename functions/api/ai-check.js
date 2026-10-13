
export async function onRequestGet({ env }) {
  if (!env.AI) {
    return Response.json({
      ok: false,
      error: "AI_BINDING_MISSING"
    }, { status: 503 });
  }

  try {
    const result = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fp8",
      {
        messages: [
          {
            role: "user",
            content: "Reply with exactly: OK"
          }
        ],
        max_tokens: 32
      }
    );

    return Response.json({
      ok: true,
      responseReceived: Boolean(result?.response)
    });

  
  } catch (error) {
    const message = String(error?.message || error);

    console.error("Workers AI diagnostic:", message);

    return Response.json({
      ok: false,
      errorName: String(error?.name || "Unknown"),
      errorCode: String(error?.code ?? "none"),
      errorMessage: message.slice(0, 500)
    }, {
      status: 502,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }
}
