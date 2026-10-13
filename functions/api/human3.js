
/**
 * 自我地图 · AI 自适应访谈接口
 * Cloudflare Pages Functions + Workers AI
 *
 * 文件位置：functions/api/human3.js
 * 必须在 Cloudflare Pages 中配置 Workers AI Binding：AI
 *
 * 不需要 OPENAI_API_KEY 或 OPENAI_MODEL。
 */

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

const SYSTEM = `
你是《自我地图》人生发展地图模块的自适应访谈引导者。

采用四个观察象限：
Mind：认知、情绪、思维、自我意识
Body：健康、睡眠、运动、精力
Spirit：价值、意义、关系、方向
Vocation：技能、工作、收入、商业能力、自由度

三个暂定发展层级：
L1：主要依赖既定模式
L2：主动探索、自主决策，但尚不稳定
L3：能够持续整合、创造与调整

这些层级不是人格判断、价值判断或医学诊断。

访谈规则：
1. 每次只提出一个最重要的开放式问题。
2. 优先询问真实经历、具体行动和现实约束。
3. 避免重复问题、暗示、标签、迎合和绝对化结论。
4. 关注目标与行为之间的差异，但不要武断归因。
5. 不要假设用户年龄、性别、职业或文化背景。
6. 健康及心理健康内容只作一般反思，不作诊断。
7. 对未成年人使用适龄、非评判性语言。
8. 如发现严重危机，应停止层级判定，建议寻求可信赖的现实支持和专业帮助。
9. 每个象限至少需要一条具体行为证据，才可暂定层级。
10. 证据不足时，层级必须填写“未确定”。
11. 不得编造用户经历。
12. 访谈参考长度为12到20轮，不是硬性要求。
13. 已有充分证据时，可以提前生成报告。
14. 所有输出必须使用简体中文。

只输出合法 JSON，不要 Markdown、代码块或额外解释。
`;

const JSON_RULE = `
继续访谈时，输出：
{
  "type": "question",
  "question": "一句具体的开放式问题"
}

生成报告时，输出：
{
  "type": "report",
  "report": {
    "summary": "150字以内的总体分析",
    "quadrants": {
      "mind": {
        "level": "L1/L2/L3/未确定",
        "evidence": ["具体证据"],
        "counter_evidence": ["反向证据或尚未核实的信息"],
        "uncertainty": "不确定性",
        "next_action": "一个可执行的小行动"
      },
      "body": {
        "level": "未确定",
        "evidence": [],
        "counter_evidence": [],
        "uncertainty": "",
        "next_action": ""
      },
      "spirit": {
        "level": "未确定",
        "evidence": [],
        "counter_evidence": [],
        "uncertainty": "",
        "next_action": ""
      },
      "vocation": {
        "level": "未确定",
        "evidence": [],
        "counter_evidence": [],
        "uncertainty": "",
        "next_action": ""
      }
    },
    "priorities": ["最多三条优先行动"]
  }
}

四个象限都必须包含相同字段。
level 必须且只能是 L1、L2、L3、未确定之一。
仅根据访谈记录判断，不得编造证据。
`;

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function validText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.length <= maxLength
  );
}

function validReport(report) {
  if (!report || typeof report !== "object") {
    return false;
  }

  if (
    typeof report.summary !== "string" ||
    !report.quadrants ||
    !Array.isArray(report.priorities)
  ) {
    return false;
  }

  const levels = ["L1", "L2", "L3", "未确定"];
  const keys = ["mind", "body", "spirit", "vocation"];

  return keys.every((key) => {
    const item = report.quadrants[key];

    return (
      item &&
      levels.includes(item.level) &&
      Array.isArray(item.evidence) &&
      Array.isArray(item.counter_evidence) &&
      typeof item.uncertainty === "string" &&
      typeof item.next_action === "string"
    );
  });
}

function parseModelOutput(output) {
  if (
    output &&
    typeof output === "object" &&
    typeof output.type === "string"
  ) {
    return output;
  }

  let raw =
    typeof output === "string"
      ? output
      : output?.response;

  if (raw && typeof raw === "object") {
    return raw;
  }

  if (typeof raw !== "string") {
    throw new Error("Empty model response");
  }

  raw = raw.trim();

  // 兼容模型偶尔输出的 Markdown 代码块
  raw = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(raw);
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return reply({
      error: "Cloudflare Workers AI 尚未绑定。"
    }, 503);
  }

  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (contentLength > 60000) {
    return reply({ error: "请求过大。" }, 413);
  }

  let input;

  try {
    input = await request.json();
  } catch {
    return reply({ error: "无效的 JSON。" }, 400);
  }

  const {
    action,
    question,
    answer,
    turns
  } = input || {};

  if (
    !["answer", "skip", "finish"].includes(action) ||
    !validText(question, 500) ||
    !validText(answer, 2500) ||
    !Array.isArray(turns) ||
    turns.length > 30
  ) {
    return reply({
      error: "输入格式或长度不正确。"
    }, 400);
  }

  const historyValid = turns.every((turn) =>
    turn &&
    validText(turn.question, 500) &&
    validText(turn.answer, 2500)
  );

  if (!historyValid) {
    return reply({
      error: "历史记录格式不正确。"
    }, 400);
  }

  const history = turns.map((turn, index) => (
    `${index + 1}. 问：${turn.question}\n答：${turn.answer}`
  )).join("\n");

  const transcript = `
既有访谈：
${history || "（无）"}

当前问题：
${question}

当前回答：
${
  action === "skip"
    ? "[跳过]"
    : action === "finish"
      ? "[用户要求提前结束]"
      : answer
}

本次动作：${action}
`;

  // 防止过长历史记录持续消耗免费推理额度
  if (transcript.length > 14000) {
    return reply({
      error: "访谈记录过长，请结束访谈或重新开始。"
    }, 413);
  }

  const shouldFinish =
    action === "finish" ||
    turns.length >= 19;

  const instruction = shouldFinish
    ? "现在生成报告。证据不足的象限必须标记为未确定。"
    : "决定最值得追问的一项信息。证据充足时可以生成报告，否则继续提出一个问题。不要重复提问。";

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: SYSTEM + "\n" + JSON_RULE
        },
        {
          role: "user",
          content: transcript + "\n" + instruction
        }
      ],
      response_format: {
        type: "json_object"
      },
      temperature: 0.35,
      max_tokens: shouldFinish ? 2300 : 500,
      stream: false
    });

    const data = parseModelOutput(result);

    if (
      data.type === "question" &&
      typeof data.question === "string" &&
      data.question.length >= 5 &&
      data.question.length <= 500
    ) {
      return reply({
        type: "question",
        question: data.question
      });
    }

    if (
      data.type === "report" &&
      validReport(data.report)
    ) {
      return reply({
        type: "report",
        report: data.report
      });
    }

    return reply({
      error: "模型输出未通过格式校验，请重试。"
    }, 502);

  } catch (error) {
    console.error(
      "Workers AI error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return reply({
      error: "AI 服务暂时不可用，请稍后重试。"
    }, 502);
  }
}

export function onRequestGet() {
  return reply({
    error: "请使用 POST 请求。"
  }, 405);
}
