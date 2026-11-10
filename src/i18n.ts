import { useSyncExternalStore } from 'react';
import { Descriptions } from '../data/characters';
import { DEFAULT_NAME } from '../convex/constants';
export type Locale = 'zh-CN' | 'en';
export const messages = {
  input_budget: '输入内容超出预算，已使用本地策略',
  'Original record, not automatically translated': '原始记录，未自动翻译',
  'Human player': '真人玩家',
  Me: '我',
  'Interface language': '界面语言',
  'NPC language: {language}': 'NPC 生成语言：{language}',
  'Simplified Chinese': '简体中文',
  English: '英语',
  'NPC generation language': 'NPC 生成语言',
  'Changes new dialogue and memories for the entire town, not history. Separate from this browser\u2019s interface language.':
    '影响整个小镇的新对话与记忆，不改写历史；与仅本浏览器的界面语言分开。',
  'Updating NPC language\u2026': '正在更新 NPC 生成语言…',
  'NPC language updated.': 'NPC 生成语言已更新。',

  cache: '缓存',
  budget_fallback: '预算不足，使用回退策略',
  lease_expired: '任务执行期限已过',
  invalidated: '策略已失效',
  single_candidate: '唯一候选动作',
  choice: '选项',
  predicate: '条件判断',
  score: '评分',
  refusal: '模型拒绝回答',
  authentication: '服务认证失败',
  billing_quota: '计费额度不足',
  missing_key: '未配置模型密钥',
  pricing_unavailable: '缺少有效的模型价格配置',
  low_confidence: '模型置信度不足，已使用回退策略',
  invalid_request: '请求格式无效',
  timeout: '请求超时',
  network_error: '网络连接失败',
  rate_limited: '请求受到限流',
  service_unavailable: '模型服务暂不可用',
  http_error: '服务请求失败',
  invalid_response: '模型响应格式无效',
  worker_error: '决策任务执行失败',
  'A conversation invitation was declined.': '一次对话邀请被拒绝了。',
  'Completed a shared conversation. This records contact, not inferred sentiment.':
    '完成了一次共同对话。此记录仅表示发生过交流，不推断双方情感。',

  'Offer a brief greeting without a long commitment.': '简短打个招呼，不占用太多时间。',
  'Use conversation to repair a bond or address a promise.': '通过交谈修复关系或回应承诺。',
  stale_operation: '操作已失效',
  stale_state: '状态已过期',
  missing_player: '角色已离开',
  invalid_action: '动作无效',
  invalid_invitation: '邀请已失效',
  executed: '已执行',
  busy: '正在忙碌',
  target_left: '对方已离开',
  target_busy: '对方正在忙碌',
  cooldown: '冷却中',

  'reading a book': '正在读书',
  daydreaming: '正在发呆',
  gardening: '正在园艺劳动',
  'Taking a quiet break': '正在安静休息',
  'Waving hello': '正在挥手打招呼',
  'Respond to an invitation with personality and relationship context.': '结合性格与关系回应邀请。',
  'Decline when safety, energy, or existing commitments matter more.':
    '优先考虑安全、精力或现有承诺，因此拒绝邀请。',
  'Finish the current engine action before starting another.': '先完成当前动作，再开始下一项。',
  'Recover energy and composure.': '恢复精力，平复情绪。',
  'Explore using the existing walking mechanism.': '在小镇中走动探索。',
  'Continue exploring while preserving the current exploration goal.':
    '保持当前探索目标，继续探索。',
  'Give a strained relationship space.': '为紧张的关系留出空间。',
  'Seek conversation based on curiosity and social bonds.': '出于好奇心和社交关系主动交谈。',
  'Repeated rejection strained this relationship.': '反复拒绝让这段关系变得紧张。',
  'Buffer health': '缓冲状态',
  intervals: '区间',
  'Base:': '基准：',
  'seconds ago': '秒前',
  server: '服务器',
  Running: '运行中',
  Stopped: '已停止',
  'Generation number:': '运行代数：',
  'Input number:': '输入序号：',
  'Status:': '状态：',
  'Client skew:': '客户端时差：',
  'Engine stats': '引擎统计',

  'AI Town': 'AI 小镇',
  'A virtual town where AI characters live, chat and socialize.':
    'AI 角色在这里生活、聊天、交朋友。',
  Help: '帮助',
  'Help modal': '使用帮助',
  Spectating: '旁观',
  Interactivity: '互动',
  'Controls:': '操作方式：',
  'Click to navigate around.': '点击地图即可移动。',
  Star: '收藏项目',
  Close: '关闭',
  Language: '语言',
  'Loading town…': '正在加载小镇…',
  'Click on an agent on the map to see chat history.': '点击地图上的角色，查看介绍与聊天记录。',
  'Start conversation': '开始对话',
  'Waiting for accept...': '等待接受邀请…',
  'Walking over...': '正在走近…',
  'Leave conversation': '结束对话',
  Accept: '接受',
  Reject: '拒绝',
  'This is you!': '这就是你！',
  'Conversing with you!': '正在与你交谈！',
  'Previous conversation': '上次对话',
  'typing...': '正在输入…',
  'Type here': '输入消息，按回车发送',
  Freeze: '暂停',
  Unfreeze: '继续',
  Music: '音乐',
  Mute: '静音',
  Leave: '离开',
  Interact: '加入小镇',
  'Log in': '登录',
  'Powered by': '技术支持',
  'Powered by Convex': '由 Convex 提供技术支持',
  'Play AI generated music (press m to play/mute)': '播放 AI 生成的音乐（按 M 播放或静音）',
  'When freezing a world, the agents will take some time to stop what they are doing before they become frozen. ':
    '暂停后，角色会先完成当前动作，再停止活动。',
  'Something went wrong. Please try again.': '操作未完成，请稍后重试。',
  'Unknown character': '无法加载角色外观',
  'Unknown resident': '未知居民',
  '{name} joined the conversation.': '{name} 加入了对话。',
  '{name} left the conversation.': '{name} 离开了对话。',
  'Historical messages are shown in their original language.': '历史消息保留原文，不会自动翻译。',
  'Welcome to AI town. AI town supports both anonymous spectators and logged in interactivity.':
    '欢迎来到 AI 小镇。你可以旁观角色生活，也可以加入小镇与他们互动。',
  'Click and drag to move around the town, and scroll in and out to zoom. You can click on an individual character to view its chat history.':
    '拖动地图来浏览小镇，滚动鼠标滚轮来缩放。点击角色可以查看介绍和聊天记录。',
  'Click Interact to join the simulation. Your character appears on the map with a highlighted circle underneath.':
    '点击“加入小镇”进入模拟世界。你的角色会出现在地图上，脚下有高亮圆圈。',
  'Click a character, then Start conversation. They will walk toward you and begin chatting when nearby. Leave by moving away or selecting Leave conversation. Incoming invitations appear in the conversation panel.':
    '点击角色，再选择“开始对话”。对方会向你走来，靠近后即可聊天。移动离开或点击“结束对话”即可退出。收到的邀请会显示在对话面板中。',
  'The town supports {count} human players at a time. After five idle minutes you are automatically removed.':
    '小镇最多同时容纳 {count} 位真人玩家。闲置五分钟后，你会自动离开小镇。',
  'NPC Intelligence': '角色智能',
  Loading: '加载中',
  'Loading NPC state…': '正在加载角色状态…',
  'World policy': '世界决策模式',
  Classic: '经典',
  Hybrid: '混合',
  Mock: '模拟',
  'NPC decisions are disabled on the server.': '服务器已禁用角色决策。',
  'Changes apply globally to all worlds. Hybrid may use paid model requests; mock uses local decisions.':
    '更改将应用于所有世界。混合模式可能调用付费模型；模拟模式使用本地决策。',
  'Read-only. Mode changes must be enabled by the server operator in a trusted deployment.':
    '当前为只读。服务器管理员须在可信部署中启用模式切换。',
  'Updating policy…': '正在更新模式…',
  'Could not change mode.': '无法更改模式。',
  'Global budget & queue': '全局预算与队列',
  'Budget day (UTC)': '预算日期（UTC）',
  'No reservations yet': '暂无预留',
  'Request reservations': '预留请求数',
  'Cost reserved (USD)': '预留费用（美元）',
  'Queue / running': '排队 / 运行中',
  'Policy epoch': '策略版本',
  'Global reservation accounting, including retry allowance. This is not exact billed usage or cost.':
    '这是全局预留统计，包含重试额度，不代表实际账单用量或费用。',
  'No intelligence state yet.': '暂无智能状态。',
  'Classic mode uses the original agent behavior.': '经典模式使用原版角色行为。',
  'State appears when this NPC next makes a decision.': '角色下次决策后将显示状态。',
  'Mood derived from energy and stress': '心情由精力与压力推算',
  Tense: '紧张',
  Tired: '疲惫',
  'At ease': '放松',
  Steady: '平稳',
  Energy: '精力',
  Stress: '压力',
  'Current goal:': '当前目标：',
  'No active goal': '暂无进行中的目标',
  'Personality · 7 traits': '性格 · 7 项特质',
  'Directed relationships': '对他人的关系',
  'This NPC’s view of others. Feelings may not be mutual.':
    '这是该角色对他人的看法，感受不一定是双向的。',
  'No relationships recorded yet.': '暂无关系记录。',
  Trust: '信任',
  Familiarity: '熟悉度',
  Affinity: '好感',
  Conflict: '冲突',
  'Recent memories': '最近记忆',
  'No memories recorded yet.': '暂无记忆记录。',
  'Recent decisions': '最近决策',
  'No decision jobs recorded yet.': '暂无决策任务记录。',
  Event: '事件',
  Source: '来源',
  Execution: '执行结果',
  Choice: '选择',
  Probability: '概率',
  'Not recorded': '未记录',
  'Decisions API': '决策 API',
  'Model response & usage': '模型响应与用量',
  Model: '模型',
  Response: '响应',
  'Model choice': '模型选择',
  Confidence: '置信度',
  Attempts: '尝试次数',
  Latency: '延迟',
  'Input / output tokens': '输入 / 输出词元',
  'Estimated cost (USD)': '估算费用（美元）',
  'Provider response, separate from the executed choice. Estimated cost is not a billing receipt.':
    '这是服务商响应，与实际执行的选择分开显示。估算费用不是账单。',
  Candidates: '候选动作',
  utility: '效用分数',
  'model probability': '模型概率',
  'Utility scores are not model probabilities. Submitted decisions may still be rejected by the game’s execution checks.':
    '效用分数不等于模型概率。提交的决策仍可能被游戏执行检查拒绝。',
  'Latest {count} retained jobs for this NPC, not lifetime totals.':
    '该角色最近保留的 {count} 个任务，并非历史总数。',
  done: '已完成',
  queued: '排队中',
  running: '运行中',
  classic: '经典',
  hybrid: '混合',
  mock: '模拟',
  sociability: '社交倾向',
  caution: '谨慎',
  curiosity: '好奇心',
  cooperation: '合作意愿',
  stability: '情绪稳定性',
  selfInterest: '自利倾向',
  loyalty: '忠诚',
  socialize: '社交',
  explore: '探索',
  recover: '恢复',
  repair: '修复关系',
  keep_promise: '履行承诺',
  active: '进行中',
  completed: '已完成',
  expired: '已过期',
  pending: '待履行',
  fulfilled: '已履行',
  broken: '已失约',
  encountered_known: '遇见熟人',
  encountered_stranger: '遇见陌生人',
  invitation: '收到邀请',
  rejected: '遭到拒绝',
  goal_stalled: '目标停滞',
  conflict: '发生冲突',
  promise_due: '承诺即将到期',
  relationship_changed: '关系变化',
  pleasant_conversation: '愉快交谈',
  help: '提供帮助',
  broken_promise: '违背承诺',
  start_conversation: '开始对话',
  accept_invite: '接受邀请',
  reject_invite: '拒绝邀请',
  avoid_person: '避开对方',
  continue_current_goal: '继续当前目标',
  rest: '休息',
  wander: '漫步',
  greet_briefly: '简短问候',
  repair_relationship: '修复关系',
  submitted: '已提交',
  stale: '已失效',
  cancelled: '已取消',
  failed: '失败',
  fallback: '回退策略',
  local: '本地策略',
  decisions: '决策 API',
  categorical: '分类选择',
  noop: '无需操作',
} as const;
export type MessageKey = keyof typeof messages;
export const LOCALE_STORAGE_KEY = 'ai-town.locale';
export function readLocale(storage?: Pick<Storage, 'getItem'>): Locale {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}
let locale: Locale =
  typeof window === 'undefined'
    ? 'zh-CN'
    : (() => {
        try {
          return readLocale(window.localStorage);
        } catch {
          return 'zh-CN' as Locale;
        }
      })();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function setLocale(next: Locale) {
  locale = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = next === 'zh-CN' ? 'AI 小镇' : 'AI Town';
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* Private browsing still works in memory. */
  }
  listeners.forEach((listener) => listener());
}
if (typeof document !== 'undefined') {
  document.documentElement.lang = locale;
  document.title = locale === 'zh-CN' ? 'AI 小镇' : 'AI Town';
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === LOCALE_STORAGE_KEY) {
      locale = event.newValue === 'en' ? 'en' : 'zh-CN';
      {
        document.documentElement.lang = locale;
        document.title = locale === 'zh-CN' ? 'AI 小镇' : 'AI Town';
      }
      listeners.forEach((listener) => listener());
    }
  });
export function translate(
  key: MessageKey,
  language: Locale = locale,
  values: Record<string, string | number> = {},
): string {
  const template = language === 'zh-CN' ? messages[key] : key;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
    String(values[name] ?? match),
  );
}
export function label(value: string, language: Locale = locale): string {
  if (language === 'zh-CN' && Object.prototype.hasOwnProperty.call(messages, value))
    return translate(value as MessageKey, language);
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}
export function characterName(name: string | undefined, language: Locale = locale): string {
  if (!name) return translate('Unknown resident', language);
  if (name === DEFAULT_NAME) return translate('Me', language);
  const description = Descriptions.find((item) => item.name === name);
  return language === 'zh-CN' ? (description?.nameZh ?? name) : name;
}
export function characterDescription(
  name: string | undefined,
  original: string | undefined,
  language: Locale = locale,
): string {
  if (name === DEFAULT_NAME && original === `${DEFAULT_NAME} is a human player`)
    return translate('Human player', language);
  const description = Descriptions.find((item) => item.name === name);
  return language === 'zh-CN' && description && original === description.identity
    ? description.identityZh
    : (original ?? '');
}
/** Free-form stored text must not be humanized as if it were a protocol enum. */
export function recordedText(
  value: string,
  language: Locale = locale,
): { text: string; original: boolean } {
  const known = Object.prototype.hasOwnProperty.call(messages, value);
  return { text: known ? translate(value as MessageKey, language) : value, original: !known };
}
export function diagnosticMessage(code: string, language: Locale = locale): string {
  return Object.prototype.hasOwnProperty.call(messages, code)
    ? label(code, language)
    : translate('Something went wrong. Please try again.', language);
}
export function errorMessage(error: unknown): string {
  console.error(error);
  return translate('Something went wrong. Please try again.');
}
export function useI18n() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLocale,
    () => 'zh-CN' as Locale,
  );
  return {
    locale: current,
    setLocale,
    t: (key: MessageKey, values?: Record<string, string | number>) =>
      translate(key, current, values),
  };
}
