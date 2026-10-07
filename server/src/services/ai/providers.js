/**
 * فهرست مدل‌های هوش مصنوعی پشتیبانی‌شده در EasyShop.
 * ۵ مدل اصلی + ارائه‌دهنده‌های تکمیلی و موتور داخلی (بدون نیاز به کلید API).
 */
export const PROVIDER_CATALOG = [
  {
    slug: 'openai',
    name_fa: 'OpenAI GPT (چت‌جی‌پی‌تی)',
    name_en: 'OpenAI GPT',
    kind: 'openai',
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    default_model: 'gpt-4o-mini',
    supports_image: 1,
    supports_vision: 1,
    priority: 1,
    envKey: 'openai',
    docs: 'https://platform.openai.com/api-keys',
    badge: 'دقت بالا در متن فارسی و تولید تصویر',
  },
  {
    slug: 'anthropic',
    name_fa: 'Anthropic Claude (کلود)',
    name_en: 'Anthropic Claude',
    kind: 'anthropic',
    base_url: 'https://api.anthropic.com/v1',
    models: [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-1-20250805',
      'claude-3-7-sonnet-latest',
      'claude-3-5-haiku-latest',
    ],
    default_model: 'claude-3-5-haiku-latest',
    supports_image: 0,
    supports_vision: 1,
    priority: 2,
    envKey: 'anthropic',
    docs: 'https://console.anthropic.com/settings/keys',
    badge: 'بهترین کیفیت نوشتار و توصیف محصول',
  },
  {
    slug: 'gemini',
    name_fa: 'Google Gemini (جمینای)',
    name_en: 'Google Gemini',
    kind: 'gemini',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    default_model: 'gemini-2.5-flash',
    supports_image: 1,
    supports_vision: 1,
    priority: 3,
    envKey: 'gemini',
    docs: 'https://aistudio.google.com/app/apikey',
    badge: 'پنجره‌ی متن بزرگ و قیمت مناسب',
  },
  {
    slug: 'xai',
    name_fa: 'xAI Grok (گروک)',
    name_en: 'xAI Grok',
    kind: 'openai',
    base_url: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
    default_model: 'grok-3-mini',
    supports_image: 1,
    supports_vision: 1,
    priority: 4,
    envKey: 'xai',
    docs: 'https://console.x.ai',
    badge: 'سرعت بالا و اطلاعات به‌روز',
  },
  {
    slug: 'deepseek',
    name_fa: 'DeepSeek (دیپ‌سیک)',
    name_en: 'DeepSeek',
    kind: 'openai',
    base_url: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    default_model: 'deepseek-chat',
    supports_image: 0,
    supports_vision: 0,
    priority: 5,
    envKey: 'deepseek',
    docs: 'https://platform.deepseek.com/api_keys',
    badge: 'ارزان‌ترین گزینه برای تولید انبوه',
  },
  {
    slug: 'mistral',
    name_fa: 'Mistral AI (میسترال)',
    name_en: 'Mistral AI',
    kind: 'openai',
    base_url: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    default_model: 'mistral-small-latest',
    supports_image: 0,
    supports_vision: 1,
    priority: 6,
    envKey: 'mistral',
    docs: 'https://console.mistral.ai',
    badge: 'جایگزین اروپایی با قیمت رقابتی',
  },
  {
    slug: 'openrouter',
    name_fa: 'OpenRouter (دسترسی به ۲۰۰+ مدل)',
    name_en: 'OpenRouter',
    kind: 'openai',
    base_url: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    default_model: 'openai/gpt-4o-mini',
    supports_image: 0,
    supports_vision: 1,
    priority: 7,
    envKey: 'openrouter',
    docs: 'https://openrouter.ai/keys',
    badge: 'یک کلید، همه‌ی مدل‌ها',
  },
  {
    slug: 'ollama',
    name_fa: 'Ollama (مدل محلی روی سرور شما)',
    name_en: 'Ollama (local)',
    kind: 'openai',
    base_url: 'http://127.0.0.1:11434/v1',
    models: ['llama3.1', 'qwen2.5', 'mistral-nemo'],
    default_model: 'llama3.1',
    supports_image: 0,
    supports_vision: 0,
    priority: 8,
    envKey: 'ollama',
    docs: 'https://ollama.com',
    badge: 'کاملاً محلی و بدون هزینه‌ی توکن',
  },
  {
    slug: 'builtin',
    name_fa: 'موتور داخلی EasyShop (بدون کلید API)',
    name_en: 'EasyShop Built-in Engine',
    kind: 'builtin',
    base_url: 'local://easyshop',
    models: ['easyshop-composer-v1', 'easyshop-vision-sim-v1'],
    default_model: 'easyshop-composer-v1',
    supports_image: 1,
    supports_vision: 0,
    priority: 99,
    envKey: null,
    docs: '',
    badge: 'نیاز به کلید ندارد؛ برای دمو و حالت آفلاین',
  },
];

/** مدل‌های پرکاربرد برای انتخاب سریع در پنل مدیریت */
export const FEATURED_MODELS = [
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { provider: 'xai', model: 'grok-4', label: 'Grok 4' },
  { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3' },
];

/** قیمت تقریبی هر یک میلیون توکن (ورودی/خروجی) به دلار — برای برآورد هزینه */
export const PRICING = {
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'o4-mini': [1.1, 4.4],
  'claude-sonnet-4-5-20250929': [3, 15],
  'claude-opus-4-1-20250805': [15, 75],
  'claude-3-7-sonnet-latest': [3, 15],
  'claude-3-5-haiku-latest': [0.8, 4],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.0-flash': [0.1, 0.4],
  'grok-4': [3, 15],
  'grok-3': [3, 15],
  'grok-3-mini': [0.3, 0.5],
  'deepseek-chat': [0.27, 1.1],
  'deepseek-reasoner': [0.55, 2.19],
  'mistral-large-latest': [2, 6],
  'mistral-small-latest': [0.2, 0.6],
  'open-mistral-nemo': [0.15, 0.15],
};

export function estimateCost(model, tokensIn = 0, tokensOut = 0) {
  const key = Object.keys(PRICING).find((k) => model === k || (model || '').includes(k));
  const [inPrice, outPrice] = PRICING[key] || [1, 3];
  return Number(((tokensIn / 1e6) * inPrice + (tokensOut / 1e6) * outPrice).toFixed(6));
}

/** تفکیک خروجی مدل به متن و توکن‌ها */
export function normalizeUsage(usage = {}) {
  const tokens_in =
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? usage.inputTokens ?? 0;
  const tokens_out =
    usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? usage.outputTokens ?? 0;
  return { tokens_in, tokens_out };
}
