
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
    const rawMessage = String(error?.message || "");
    const rawCode = String(error?.code ?? "");

    // 仅返回错误编号及受限的错误类别
    // 不向公开接口返回完整异常或账户信息
    const patterns = [
      ["MODEL", /model|deprecated|not found/i],
      ["QUOTA", /quota|limit|capacity|exceeded|neurons/i],
      ["AUTH", /permission|unauthorized|forbidden|auth/i],
      ["PARAMETER", /invalid|unsupported|parameter|schema/i],
      ["BILLING", /billing|payment|subscription/i],
      ["NETWORK", /timeout|network|connection/i]
    ];

    const category =
      patterns.find(([, pattern]) => pattern.test(rawMessage))?.[0]
      || "OTHER";

    // 错误详情仅写入 Cloudflare 内部日志
    console.error("AI_CHECK_FAILURE", {
      name: error?.name,
      code: rawCode,
      message: rawMessage
    });

    return Response.json({
      ok: false,
      category,
      code: /^[0-9]{1,6}$/.test(rawCode)
        ? rawCode
        : "UNAVAILABLE",
      errorName: ["Error", "AIError", "TypeError"].includes(error?.name)
        ? error.name
        : "OTHER"
    }, { status: 502 });
  }
}
