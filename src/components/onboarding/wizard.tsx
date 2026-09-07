"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";

type KnowledgeDraft = {
  title: string;
  content: string;
  category: string;
};

const STEPS = [
  "بيانات النشاط",
  "الموقع (اختياري)",
  "الوكيل الذكي",
  "المعرفة الأولية",
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [business, setBusiness] = useState({
    name: "",
    category: "عام",
    countryCode: "SA",
    locale: "ar-SA",
    timezone: "Asia/Riyadh",
  });

  const [location, setLocation] = useState({
    name: "",
    city: "",
    addressLine: "",
    phone: "",
    code: "",
  });

  const [agent, setAgent] = useState({
    name: "موظف الاستقبال",
    roleTitle: "AI receptionist",
    language: "ar",
    dialect: "",
    tone: "مهني وودود",
    instructions: "",
  });

  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeDraft[]>([
    {
      category: KNOWLEDGE_CATEGORIES.ABOUT,
      title: "عن النشاط",
      content: "",
    },
  ]);

  function updateKnowledge(index: number, patch: Partial<KnowledgeDraft>) {
    setKnowledgeItems((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    setError(null);
    setPending(true);

    const payload = {
      business,
      location: location.name.trim()
        ? {
            name: location.name,
            city: location.city || null,
            addressLine: location.addressLine || null,
            phone: location.phone || null,
            code: location.code || null,
            timezone: business.timezone,
          }
        : null,
      agent: {
        name: agent.name,
        roleTitle: agent.roleTitle,
        language: agent.language,
        dialect: agent.dialect || null,
        tone: agent.tone || null,
        instructions: agent.instructions || null,
      },
      knowledgeItems: knowledgeItems
        .filter((item) => item.title.trim() && item.content.trim())
        .map((item) => ({
          category: item.category,
          title: item.title,
          content: item.content,
        })),
    };

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(data.error ?? data.message ?? "تعذر إكمال الإعداد");
        return;
      }
      router.push("/dashboard?next=whatsapp");
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال. حاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>إعداد مساحة العمل</CardTitle>
        <CardDescription>
          الخطوة {step + 1} من {STEPS.length}: {STEPS[step]}
        </CardDescription>
        <div className="mt-4 flex gap-2">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full ${
                index <= step ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <Alert variant="error">{error}</Alert> : null}

          {step === 0 ? (
            <>
              <div>
                <Label htmlFor="businessName">اسم النشاط</Label>
                <Input
                  id="businessName"
                  required
                  value={business.name}
                  onChange={(e) =>
                    setBusiness((b) => ({ ...b, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="category">التصنيف</Label>
                <Input
                  id="category"
                  required
                  value={business.category}
                  onChange={(e) =>
                    setBusiness((b) => ({ ...b, category: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="countryCode">الدولة</Label>
                  <Select
                    id="countryCode"
                    value={business.countryCode}
                    onChange={(e) =>
                      setBusiness((b) => ({
                        ...b,
                        countryCode: e.target.value,
                      }))
                    }
                  >
                    <option value="SA">السعودية</option>
                    <option value="AE">الإمارات</option>
                    <option value="EG">مصر</option>
                    <option value="JO">الأردن</option>
                    <option value="KW">الكويت</option>
                    <option value="BH">البحرين</option>
                    <option value="QA">قطر</option>
                    <option value="OM">عُمان</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="locale">اللغة المحلية</Label>
                  <Select
                    id="locale"
                    value={business.locale}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, locale: e.target.value }))
                    }
                  >
                    <option value="ar-SA">العربية</option>
                    <option value="en-US">English</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="timezone">المنطقة الزمنية</Label>
                  <Select
                    id="timezone"
                    value={business.timezone}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, timezone: e.target.value }))
                    }
                  >
                    <option value="Asia/Riyadh">Asia/Riyadh</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Africa/Cairo">Africa/Cairo</option>
                    <option value="Asia/Amman">Asia/Amman</option>
                    <option value="Asia/Kuwait">Asia/Kuwait</option>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Alert variant="info">
                يمكنك تخطي هذه الخطوة إن لم يكن لديك فرع بعد.
              </Alert>
              <div>
                <Label htmlFor="locationName">اسم الموقع</Label>
                <Input
                  id="locationName"
                  value={location.name}
                  onChange={(e) =>
                    setLocation((l) => ({ ...l, name: e.target.value }))
                  }
                  placeholder="الفرع الرئيسي"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="city">المدينة</Label>
                  <Input
                    id="city"
                    value={location.city}
                    onChange={(e) =>
                      setLocation((l) => ({ ...l, city: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input
                    id="phone"
                    value={location.phone}
                    onChange={(e) =>
                      setLocation((l) => ({ ...l, phone: e.target.value }))
                    }
                    dir="ltr"
                    className="text-start"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="addressLine">العنوان</Label>
                <Input
                  id="addressLine"
                  value={location.addressLine}
                  onChange={(e) =>
                    setLocation((l) => ({
                      ...l,
                      addressLine: e.target.value,
                    }))
                  }
                />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="agentName">اسم الوكيل</Label>
                  <Input
                    id="agentName"
                    required
                    value={agent.name}
                    onChange={(e) =>
                      setAgent((a) => ({ ...a, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="roleTitle">المسمى</Label>
                  <Input
                    id="roleTitle"
                    required
                    value={agent.roleTitle}
                    onChange={(e) =>
                      setAgent((a) => ({ ...a, roleTitle: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="language">اللغة</Label>
                  <Select
                    id="language"
                    value={agent.language}
                    onChange={(e) =>
                      setAgent((a) => ({ ...a, language: e.target.value }))
                    }
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dialect">اللهجة</Label>
                  <Input
                    id="dialect"
                    value={agent.dialect}
                    onChange={(e) =>
                      setAgent((a) => ({ ...a, dialect: e.target.value }))
                    }
                    placeholder="اختيارية"
                  />
                </div>
                <div>
                  <Label htmlFor="tone">النبرة</Label>
                  <Input
                    id="tone"
                    value={agent.tone}
                    onChange={(e) =>
                      setAgent((a) => ({ ...a, tone: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="instructions">التعليمات</Label>
                <Textarea
                  id="instructions"
                  value={agent.instructions}
                  onChange={(e) =>
                    setAgent((a) => ({ ...a, instructions: e.target.value }))
                  }
                  placeholder="كيف يجب أن يتصرف الوكيل مع العملاء؟"
                />
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {knowledgeItems.map((item, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-border p-4"
                >
                  <div>
                    <Label>التصنيف</Label>
                    <Select
                      value={item.category}
                      onChange={(e) =>
                        updateKnowledge(index, { category: e.target.value })
                      }
                    >
                      {Object.values(KNOWLEDGE_CATEGORIES).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>العنوان</Label>
                    <Input
                      value={item.title}
                      onChange={(e) =>
                        updateKnowledge(index, { title: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>المحتوى</Label>
                    <Textarea
                      value={item.content}
                      onChange={(e) =>
                        updateKnowledge(index, { content: e.target.value })
                      }
                      placeholder="مثال: أوقات العمل من الأحد إلى الخميس..."
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setKnowledgeItems((items) => [
                    ...items,
                    {
                      category: KNOWLEDGE_CATEGORIES.FAQ,
                      title: "",
                      content: "",
                    },
                  ])
                }
              >
                إضافة عنصر معرفة
              </Button>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || pending}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              السابق
            </Button>
            <Button type="submit" disabled={pending}>
              {step < STEPS.length - 1
                ? "التالي"
                : pending
                  ? "جارٍ الحفظ..."
                  : "إكمال الإعداد"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
