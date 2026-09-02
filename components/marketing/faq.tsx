"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { Reveal } from "@/components/marketing/reveal";
import { useLocale } from "@/components/providers/locale-provider";

const FAQ_KEYS = [
  { q: "landing.faq.q1", a: "landing.faq.a1" },
  { q: "landing.faq.q2", a: "landing.faq.a2" },
  { q: "landing.faq.q3", a: "landing.faq.a3" },
  { q: "landing.faq.q4", a: "landing.faq.a4" },
  { q: "landing.faq.q5", a: "landing.faq.a5" },
  { q: "landing.faq.q6", a: "landing.faq.a6" },
];

const FAQ_ITEMS = [
  {
    question: "Do I need to understand blockchain to use Chainventory?",
    answer:
      "No. You manage inventory the same way you would with any modern tool. Blockchain works quietly in the background as a verification layer for important records.",
  },
  {
    question: "How does blockchain verification help me?",
    answer:
      "Every stock movement gets a verifiable proof that the record is authentic and hasn't been altered. If anyone ever disputes a number, you have a tamper-evident answer.",
  },
  {
    question: "Can my whole team work on the same warehouse at once?",
    answer:
      "Yes. Multiple users can operate on one warehouse concurrently. Stock updates are atomic and synchronize in real time to everyone connected.",
  },
  {
    question: "What roles are available?",
    answer:
      "There are five roles: Owner, Manager, Staff, Auditor, and Viewer. Each controls exactly what a person can see and do, from full control down to read-only.",
  },
  {
    question: "What network is used for blockchain verification?",
    answer:
      "Chainventory currently runs on Base Sepolia, a test network. This keeps things free and safe while the product matures.",
  },
  {
    question: "Is my inventory data stored on the blockchain?",
    answer:
      "No. Your operational data lives in a secure database. Only proof records (not your full inventory) are anchored for verification.",
  },
];

/**
 * FAQ section (DESIGN §22).
 * Hairline-divided list- no card boxes, so it reads lighter than the card
 * sections above and below it.
 */
export function Faq() {
  const { t } = useLocale();
  const hasTranslation = (key: string) => {
    try { return t(key) !== key; } catch { return false; }
  };
  const useKeys = hasTranslation("landing.faq.q1");
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {useKeys ? t("landing.faq.title") : "Frequently asked questions"}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {useKeys ? t("landing.faq.subtitle") : "The quick answers- no blockchain vocabulary required."}
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <Accordion multiple>
            {(useKeys ? FAQ_KEYS : FAQ_ITEMS.map((f,i)=>({q:FAQ_ITEMS[i].question,a:FAQ_ITEMS[i].answer, isRaw:true}))).map((item: any) => {
              const q = item.isRaw ? item.q : t(item.q);
              const a = item.isRaw ? item.a : t(item.a);
              return (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-foreground py-4 text-left text-base font-medium">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {a}
                </AccordionContent>
              </AccordionItem>
            )})}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

export { FAQ_ITEMS, FAQ_KEYS };
