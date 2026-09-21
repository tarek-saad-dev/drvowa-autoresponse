/**
 * Maps API / domain error codes and technical messages to Arabic product copy.
 * Never surfaces EXTERNAL_GATE_*, PLAN_*, SQL, or runtime internals to customers.
 */

const CODE_MESSAGES: Record<string, string> = {
  PLAN_KNOWLEDGE_LIMIT:
    "وصلتَ إلى الحد الأقصى للمعلومات النشطة في خطتك. عطّل معلومة أخرى أو رقِّ خطتك لاحقاً.",
  PLAN_AGENT_LIMIT: "وصلتَ إلى الحد الأقصى لموظفي الاستقبال في خطتك.",
  PLAN_WHATSAPP_CONNECTION_LIMIT:
    "وصلتَ إلى الحد الأقصى لاتصالات واتساب في خطتك.",
  PLAN_AI_QUOTA_EXCEEDED:
    "استهلكتَ حد ردود الذكاء الاصطناعي لهذا الشهر. يتجدد الحد مع بداية الفترة التالية.",
  PLAN_WHATSAPP_OUTBOUND_QUOTA_EXCEEDED:
    "استهلكتَ حد رسائل واتساب الصادرة لهذا الشهر.",
  PLAN_SUBSCRIPTION_INACTIVE:
    "الاشتراك غير نشط حالياً. راجع صفحة الخطة أو تواصل مع الدعم.",
  RATE_LIMITED: "محاولات كثيرة. انتظر لحظات ثم أعد المحاولة.",
  EMPTY_MESSAGE: "اكتب رسالة قبل الإرسال.",
  MESSAGE_TOO_LONG: "الرسالة طويلة جداً. اختصر النص ثم أعد المحاولة.",
  INVALID_IDEMPOTENCY_KEY: "تعذر إرسال الرسالة. أعد المحاولة.",
  DESTINATION_UNAVAILABLE:
    "لا يمكن الإرسال لهذا الرقم حالياً. تحقق من بيانات المحادثة.",
  ACCOUNT_KEY_MISSING:
    "واتساب غير جاهز للإرسال. اربط واتساب من صفحة الاتصال ثم أعد المحاولة.",
  MULTI_ACCOUNT_DISABLED:
    "ربط واتساب غير متاح مؤقتاً. حاول مرة أخرى بعد قليل.",
  RUNTIME_NOT_CONFIGURED:
    "ربط واتساب غير متاح مؤقتاً. حاول مرة أخرى بعد قليل.",
  RUNTIME_TOKEN_MISSING:
    "ربط واتساب غير متاح مؤقتاً. حاول مرة أخرى بعد قليل.",
  SERVICE_NOT_AVAILABLE:
    "الخدمة غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.",
  NOT_READY: "واتساب غير متصل بعد. أكمل الربط ثم أعد المحاولة.",
};

const TECHNICAL_PATTERNS: RegExp[] = [
  /\bEXTERNAL_GATE[_A-Z0-9]*\b/i,
  /\bPLAN_[A-Z0-9_]+\b/,
  /\bQUOTA_EXCEEDED\b/i,
  /\bMULTI_ACCOUNT_DISABLED\b/i,
  /\bSERVICE_NOT_AVAILABLE\b/i,
  /\bBusinessID\b/i,
  /\baccountKey\b/i,
  /\bReservationKey\b/i,
  /\bLeaseVersion\b/i,
  /\bSQL\b/i,
  /database/i,
  /stack/i,
  /ECONNREFUSED/i,
  /mssql/i,
];

function looksTechnical(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true;
  return TECHNICAL_PATTERNS.some((re) => re.test(t));
}

export function mapUserFacingError(
  input: {
    error?: string | null;
    code?: string | null;
    errorCode?: string | null;
    message?: string | null;
  } | null | undefined,
  fallback = "تعذر إتمام العملية. حاول مرة أخرى.",
): string {
  const code = (input?.code || input?.errorCode || "").trim();
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const raw = (input?.error || input?.message || "").trim();
  if (raw && CODE_MESSAGES[raw]) {
    return CODE_MESSAGES[raw];
  }
  if (raw && !looksTechnical(raw)) {
    // Prefer Arabic / already-human messages from the API.
    return raw;
  }

  // Common English API messages → Arabic
  const lower = raw.toLowerCase();
  if (lower.includes("whatsapp channel connection not found")) {
    return "اربط واتساب أولاً قبل تفعيل الرد الآلي.";
  }
  if (lower.includes("whatsapp must be connected")) {
    return "اربط واتساب أولاً قبل تفعيل الرد الآلي.";
  }
  if (lower.includes("inactive agent")) {
    return "اختر موظف استقبال نشطاً قبل تفعيل الرد الآلي.";
  }
  if (lower.includes("knowledge item not found")) {
    return "عنصر المعرفة غير موجود.";
  }
  if (lower.includes("not found")) {
    return "العنصر غير موجود أو لم يعد متاحاً.";
  }
  if (lower.includes("validation") || lower.includes("invalid json")) {
    return "تحقق من الحقول المدخلة ثم أعد المحاولة.";
  }
  if (lower.includes("unauthorized") || lower.includes("session")) {
    return "انتهت الجلسة. سجّل الدخول من جديد.";
  }
  if (lower.includes("forbidden") || lower.includes("access denied")) {
    return "لا تملك صلاحية تنفيذ هذا الإجراء.";
  }
  if (lower.includes("database") || lower.includes("unavailable")) {
    return "الخدمة غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل.";
  }

  return fallback;
}

export function mapFetchError(
  responseOk: boolean,
  data: unknown,
  fallback?: string,
): string | null {
  if (responseOk) return null;
  const body = (data ?? {}) as {
    error?: string;
    code?: string;
    errorCode?: string;
    message?: string;
  };
  return mapUserFacingError(body, fallback);
}
