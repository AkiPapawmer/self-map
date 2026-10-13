// Cloudflare Pages Function. Configure OPENAI_API_KEY and OPENAI_MODEL as encrypted server variables.
const SYSTEM = `你是《自我地图》人生发展地图模块的自适应访谈引导者。以 Mind(认知情绪思维自我意识)、Body(健康睡眠运动精力)、Spirit(价值意义关系方向)、Vocation(技能工作收入商业能力自由度) 四象限为框架。三个发展层级 L1=主要依赖既定模式；L2=主动探索、自主决策但尚不稳定；L3=能够持续整合、创造与调整。层级不是人格、价值或医学诊断。每次只提出一个最重要的问题，优先询问真实经历和可核对的行动，避免暗示、标签、迎合与绝对化结论。关注用户真正想要的生活、目标行为矛盾、拖延与环境约束；不要假设用户的年龄、职业、性别或文化背景。涉及健康和心理健康仅做一般反思，不诊断、不提供医疗结论；对未成年人使用适龄、非评判性语言。若用户表达严重危机，应停止层级判定并建议寻求可信赖的现实支持与当地专业帮助。每个象限至少有一条具体行为证据才能考虑暂定层级，否则写“未确定”。不确定时坦诚说明。不要引用不存在的用户经历。访谈以12到20轮为参考，不是硬性题数；如果用户已给出充足证据可提前结束。只输出有效 JSON，不要 markdown。`;
const JSON_RULE = `返回 JSON。继续访谈时：{"type":"question","question":"一句具体开放式问题"}。生成报告时：{"type":"report","report":{"summary":"150字以内总览","quadrants":{"mind":{"level":"L1/L2/L3/未确定","evidence":["具体证据"],"counter_evidence":["反向证据或尚未核实的信息"],"uncertainty":"不确定性","next_action":"一个可执行的小行动"},"body":{},"spirit":{},"vocation":{}},"priorities":["最多三条优先行动"]}}。四个象限都必须使用相同字段；只可根据访谈回答得出结论。`;
function reply(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function onRequestPost({request,env}){
 if(!env.OPENAI_API_KEY||!env.OPENAI_MODEL)return reply({error:'服务端尚未配置模型密钥或模型名称。'},503);
 const length=Number(request.headers.get('content-length')||0);if(length>60000)return reply({error:'请求过大。'},413);
 let input;try{input=await request.json();}catch{return reply({error:'无效的 JSON。'},400);}
 const {action,question,answer,turns}=input||{};
 if(!['answer','skip','finish'].includes(action)||typeof question!=='string'||question.length>500||!Array.isArray(turns)||turns.length>30||typeof answer!=='string'||answer.length>2500)return reply({error:'输入格式或长度不正确。'},400);
 if(turns.some(t=>!t||typeof t.question!=='string'||typeof t.answer!=='string'||t.question.length>500||t.answer.length>2500))return reply({error:'历史记录格式不正确。'},400);
 const history=turns.map((t,i)=>`${i+1}. 问：${t.question}\n答：${t.answer}`).join('\n');
 const transcript=`既有访谈：\n${history||'（无）'}\n当前问题：${question}\n当前回答：${action==='skip'?'[跳过]':action==='finish'?'[用户要求提前结束]':answer}\n本次动作：${action}。`;
 const instruction=action==='finish'||turns.length>=19?'现在生成报告。证据不足则明确写未确定。':`决定最值得追问的一项信息。已有充分证据时可以生成报告，否则继续提出一个问题。不要重复已问的问题。`;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 try{
   const api=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL,temperature:0.35,max_tokens:1800,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM+'\n'+JSON_RULE},{role:'user',content:transcript+'\n'+instruction}]})});
   if(!api.ok)return reply({error:'模型服务暂时不可用。'},502);
   const payload=await api.json();const raw=payload.choices?.[0]?.message?.content;let data;try{data=JSON.parse(raw);}catch{return reply({error:'模型返回的数据无法解析，请重试。'},502);}
   if(data.type==='question'&&typeof data.question==='string'&&data.question.length>=5&&data.question.length<=500)return reply({type:'question',question:data.question});
   if(data.type==='report'&&data.report&&typeof data.report==='object'&&['mind','body','spirit','vocation'].every(k=>data.report.quadrants?.[k]&&['L1','L2','L3','未确定'].includes(data.report.quadrants[k].level)))return reply({type:'report',report:data.report});
   return reply({error:'模型输出未通过格式校验，请重试。'},502);
 }catch{return reply({error:'模型请求超时或网络错误。'},502);}finally{clearTimeout(timer);}
}
export function onRequestGet(){return reply({error:'请使用 POST 请求。'},405);}
