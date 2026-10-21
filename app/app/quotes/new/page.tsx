import type { Metadata } from "next";
import { CheckCircle2, CircleSlash, MapPin, ShieldAlert } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { NewQuoteForm } from "./form";

export const metadata: Metadata = { title: "New quote" };

const RULES = [
  { icon: CheckCircle2, tone: "text-emerald-700", text: "Prices come only from your price list. The AI picks items and measurements; the app does the maths." },
  { icon: MapPin, tone: "text-amber-700", text: "Car parks, commercial sites and big areas get “site visit needed” instead of a price." },
  { icon: CircleSlash, tone: "text-red-700", text: "Work you don't do, or have no price for, is listed separately rather than guessed." },
  { icon: ShieldAlert, tone: "text-ink-2", text: "Instructions hidden in an email (discounts, “approve this”) are ignored and flagged." },
];

export default function NewQuotePage() {
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Quotes"
        title="New quote"
        description="Paste the customer's email or website enquiry. You'll get a draft to check; nothing is sent to the customer."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <NewQuoteForm />
        <Card title="How the draft is made" className="h-fit">
          <ul className="space-y-4">
            {RULES.map(({ icon: Icon, tone, text }) => (
              <li key={text} className="flex gap-3 text-[13px] leading-relaxed text-ink-2">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
