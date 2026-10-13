
export async function onRequestGet({ env }) {
  if (!env.AI) {
    return Response.json({
      ok: false,
      error: "AI_BINDING_MISSING"
    }, { status: 503 });
  }

  try {
    const result = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct",
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

    // 只识别常见错误类别，不公开原始异常内容
    let reason = "UNKNOWN_MODEL_ERROR";

    if (/model.*not found|unknown model|invalid model/i.test(message)) {
      reason = "MODEL_NOT_FOUND";
    } else if (/quota|limit|capacity|exceeded/i.test(message)) {
      reason = "QUOTA_OR_CAPACITY";
    } else if (/unauthorized|permission|forbidden|authentication/i.test(message)) {
      reason = "PERMISSION_DENIED";
    } else if (/invalid|unsupported|parameter|schema/i.test(message)) {
      reason = "INVALID_PARAMETERS";
    } else if (/timeout|timed out/i.test(message)) {
      reason = "TIMEOUT";
    }

    console.error("AI_CHECK_FAILURE", message);

    return Response.json({
      ok: false,
      stage: "inference",
      reason
    }, { status: 502 });
  }
}
