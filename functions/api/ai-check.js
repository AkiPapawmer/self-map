
export async function onRequestGet({ env }) {
  if (!env.AI) {
    return Response.json({
      ok: false,
      stage: "binding",
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
            content: "请只回答：测试成功"
          }
        ],
        max_tokens: 40,
        stream: false
      }
    );

    return Response.json({
      ok: true,
      stage: "inference",
      responseReceived: Boolean(result?.response)
    });

  } catch (error) {
    const message = String(error?.message || error);

    // 不向公开接口暴露 Cloudflare 的原始错误信息
    console.error("AI_CHECK_FAILURE", {
      name: error?.name,
      message
    });

    return Response.json({
      ok: false,
      stage: "inference",
      error: "MODEL_CALL_FAILED"
    }, { status: 502 });
  }
}
