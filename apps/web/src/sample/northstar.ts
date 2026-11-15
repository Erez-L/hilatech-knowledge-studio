/**
 * Sample-preview fixtures for the fictional company "Northstar Business Services".
 *
 * IMPORTANT: everything in this file is hand-written sample content. It is NOT
 * produced by a language model, an embedding model or a retrieval step. The UI
 * must always label it as a pre-written sample (see `workspace.preview.*`
 * messages). Real documents, retrieval and generation replace this in the
 * functional milestone.
 */
import type { Locale } from "@/i18n/routing";

export type Localized<T = string> = Record<Locale, T>;

export type SampleDocument = {
  id: string;
  title: Localized;
  fileName: string;
  kind: "pdf" | "docx";
  /** PDFs are addressed by page, DOCX files by section number. */
  unit: "page" | "section";
  /** Ordered list of every addressable page or section in the document. */
  locators: string[];
};

export type Passage = {
  id: string;
  documentId: string;
  locator: string;
  heading: Localized;
  before: Localized;
  evidence: Localized;
  after: Localized;
};

export type Inline = string | { cite: string };

export type AnswerBlock =
  | { type: "p"; content: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] };

export type SampleConversation = {
  id: string;
  title: Localized;
  question: Localized;
  answer: Localized<AnswerBlock[]>;
  followUps: string[];
};

const pages = (count: number) => Array.from({ length: count }, (_, i) => String(i + 1));

export const company: Localized = {
  en: "Northstar Business Services",
  he: "נורת'סטאר שירותים עסקיים",
};

export const documents: SampleDocument[] = [
  {
    id: "support-handbook",
    title: { en: "Customer Support Handbook", he: "מדריך שירות הלקוחות" },
    fileName: "customer-support-handbook.pdf",
    kind: "pdf",
    unit: "page",
    locators: pages(24),
  },
  {
    id: "refund-policy",
    title: { en: "Refund and Cancellation Policy", he: "מדיניות החזרים וביטולים" },
    fileName: "refund-and-cancellation-policy.pdf",
    kind: "pdf",
    unit: "page",
    locators: pages(8),
  },
  {
    id: "onboarding-guide",
    title: { en: "Employee Onboarding Guide", he: "מדריך קליטת עובדים" },
    fileName: "employee-onboarding-guide.docx",
    kind: "docx",
    unit: "section",
    locators: ["1.1", "1.2", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2"],
  },
  {
    id: "service-catalog",
    title: { en: "Product and Service Catalog", he: "קטלוג מוצרים ושירותים" },
    fileName: "product-and-service-catalog.pdf",
    kind: "pdf",
    unit: "page",
    locators: pages(12),
  },
];

export const passages: Passage[] = [
  {
    id: "handbook-response",
    documentId: "support-handbook",
    locator: "7",
    heading: { en: "Response targets", he: "יעדי זמן תגובה" },
    before: {
      en: "Every ticket is given a priority when it is opened. The priority decides how quickly the customer hears from us.",
      he: "כל פנייה מקבלת דרגת עדיפות ברגע פתיחתה. העדיפות קובעת תוך כמה זמן הלקוח מקבל מאיתנו מענה.",
    },
    evidence: {
      en: "Priority 1 tickets receive a first response within 30 minutes during business hours, and a status update every hour until the issue is resolved.",
      he: "פניות בעדיפות 1 מקבלות מענה ראשון בתוך 30 דקות בשעות הפעילות, ועדכון סטטוס מדי שעה עד לפתרון התקלה.",
    },
    after: {
      en: "Priority 2 tickets receive a first response within 4 business hours.",
      he: "פניות בעדיפות 2 מקבלות מענה ראשון בתוך 4 שעות עבודה.",
    },
  },
  {
    id: "handbook-escalation",
    documentId: "support-handbook",
    locator: "8",
    heading: { en: "Escalation", he: "הסלמה" },
    before: {
      en: "Escalation exists so that no urgent ticket depends on a single person.",
      he: "מנגנון ההסלמה נועד להבטיח שאף פנייה דחופה לא תהיה תלויה באדם אחד.",
    },
    evidence: {
      en: "If a Priority 1 ticket is still open after 2 hours, the agent escalates it to the duty manager and records the escalation in the ticket.",
      he: "אם פנייה בעדיפות 1 עדיין פתוחה לאחר שעתיים, הנציג מעביר אותה למנהל התורן ומתעד את ההסלמה בפנייה.",
    },
    after: {
      en: "The duty manager decides whether to bring in the account owner.",
      he: "המנהל התורן מחליט אם לערב את מנהל תיק הלקוח.",
    },
  },
  {
    id: "handbook-refund-approval",
    documentId: "support-handbook",
    locator: "11",
    heading: { en: "Refund approvals", he: "אישור החזרים כספיים" },
    before: {
      en: "Refund requests are checked against the Refund and Cancellation Policy before any amount is promised.",
      he: "בקשות להחזר נבדקות מול מדיניות ההחזרים והביטולים לפני שמבטיחים ללקוח סכום כלשהו.",
    },
    evidence: {
      en: "Support agents may approve refunds of up to $400 on their own. Larger refunds need approval from a team lead before the customer is told.",
      he: "נציגי שירות רשאים לאשר בעצמם החזרים של עד ‎$400‎. החזרים גבוהים יותר דורשים אישור ראש צוות לפני שמעדכנים את הלקוח.",
    },
    after: {
      en: "Every approved refund is logged with the ticket number.",
      he: "כל החזר שאושר מתועד יחד עם מספר הפנייה.",
    },
  },
  {
    id: "refund-annual",
    documentId: "refund-policy",
    locator: "3",
    heading: { en: "Annual plans", he: "מסלולים שנתיים" },
    before: {
      en: "Monthly plans can be cancelled at any time. The current month is not refunded.",
      he: "מסלולים חודשיים ניתנים לביטול בכל עת. החודש השוטף אינו מוחזר.",
    },
    evidence: {
      en: "Annual plans can be refunded in full within 30 days of purchase. After 30 days, the unused months are refunded pro rata, less a 10% early-cancellation fee.",
      he: "מסלולים שנתיים זכאים להחזר מלא בתוך 30 יום ממועד הרכישה. לאחר 30 יום, החודשים שלא נוצלו מוחזרים באופן יחסי, בניכוי דמי ביטול מוקדם של 10%.",
    },
    after: {
      en: "Refunds are returned to the original payment method within 7 business days.",
      he: "ההחזר מועבר לאמצעי התשלום המקורי בתוך 7 ימי עסקים.",
    },
  },
  {
    id: "onboarding-day-one",
    documentId: "onboarding-guide",
    locator: "2.1",
    heading: { en: "Your first day", he: "היום הראשון שלך" },
    before: {
      en: "People Operations will meet you at reception at 9:00.",
      he: "צוות משאבי האנוש יפגוש אותך בקבלה בשעה 9:00.",
    },
    evidence: {
      en: "On day one you receive your laptop and access badge, and your onboarding buddy walks you through the tools your team uses.",
      he: "ביום הראשון מקבלים מחשב נייד ותג כניסה, והחונך שלך עובר איתך על הכלים שבהם הצוות משתמש.",
    },
    after: {
      en: "Lunch on the first day is with your team.",
      he: "ארוחת הצהריים ביום הראשון היא עם הצוות.",
    },
  },
  {
    id: "onboarding-training",
    documentId: "onboarding-guide",
    locator: "2.3",
    heading: { en: "Required training", he: "הדרכות חובה" },
    before: {
      en: "Two courses are required for every new employee, whatever the role.",
      he: "שני קורסים הם חובה לכל עובד חדש, בכל תפקיד.",
    },
    evidence: {
      en: "Complete the information security course by the end of day three. Access to client systems is granted only after the course is passed.",
      he: "יש להשלים את קורס אבטחת המידע עד סוף היום השלישי. גישה למערכות הלקוחות ניתנת רק לאחר מעבר הקורס.",
    },
    after: {
      en: "The second course, on client confidentiality, is due within 30 days.",
      he: "את הקורס השני, בנושא סודיות לקוחות, יש להשלים בתוך 30 יום.",
    },
  },
  {
    id: "onboarding-payroll",
    documentId: "onboarding-guide",
    locator: "2.4",
    heading: { en: "Payroll and paperwork", he: "שכר וטפסים" },
    before: {
      en: "The forms you need are in your welcome email.",
      he: "הטפסים הדרושים מצורפים להודעת קבלת הפנים שנשלחה אליך.",
    },
    evidence: {
      en: "Submit your payroll and tax forms to People Operations by the end of your first week so that your first salary is paid on time.",
      he: "יש להגיש את טופסי השכר והמס למשאבי אנוש עד סוף השבוע הראשון, כדי שהמשכורת הראשונה תשולם במועד.",
    },
    after: {
      en: "Questions about forms go to the People Operations desk.",
      he: "שאלות בנוגע לטפסים מפנים לדלפק משאבי האנוש.",
    },
  },
  {
    id: "catalog-essentials",
    documentId: "service-catalog",
    locator: "4",
    heading: { en: "Bookkeeping Essentials", he: "הנהלת חשבונות — Essentials" },
    before: {
      en: "Our entry plan, for businesses that need their books kept in order each month.",
      he: "מסלול הבסיס שלנו, לעסקים שצריכים ספרים מסודרים מדי חודש.",
    },
    evidence: {
      en: "Bookkeeping Essentials covers up to 150 transactions a month, monthly bank reconciliation and a quarterly financial summary, for $290 a month.",
      he: "מסלול Essentials כולל עד 150 תנועות בחודש, התאמת בנקים חודשית וסיכום פיננסי רבעוני, במחיר ‎$290‎ לחודש.",
    },
    after: {
      en: "Additional transactions are billed in blocks of 50.",
      he: "תנועות נוספות מחויבות בחבילות של 50.",
    },
  },
  {
    id: "catalog-growth",
    documentId: "service-catalog",
    locator: "5",
    heading: { en: "Bookkeeping Growth", he: "הנהלת חשבונות — Growth" },
    before: {
      en: "For businesses that want a closer view of their numbers.",
      he: "לעסקים שרוצים תמונה מפורטת יותר של המספרים שלהם.",
    },
    evidence: {
      en: "Bookkeeping Growth covers up to 600 transactions a month, adds a named accountant and monthly management reports, and costs $640 a month.",
      he: "מסלול Growth כולל עד 600 תנועות בחודש, מוסיף רואה חשבון קבוע ודוחות ניהוליים חודשיים, ומחירו ‎$640‎ לחודש.",
    },
    after: {
      en: "Payroll can be added to either plan.",
      he: "ניתן להוסיף שירותי שכר לכל אחד מהמסלולים.",
    },
  },
];

const c = (cite: string): Inline => ({ cite });

export const conversations: SampleConversation[] = [
  {
    id: "annual-refunds",
    title: { en: "Annual plan refunds", he: "החזרים במסלול שנתי" },
    question: {
      en: "What is the refund window for annual plans, and who can approve the refund?",
      he: "מהו חלון ההחזר במסלולים שנתיים, ומי רשאי לאשר את ההחזר?",
    },
    answer: {
      en: [
        { type: "p", content: ["Annual plans can be refunded in full within 30 days of purchase.", c("refund-annual")] },
        {
          type: "list",
          items: [
            ["After 30 days, the unused months are refunded pro rata, less a 10% early-cancellation fee.", c("refund-annual")],
            ["A support agent can approve a refund of up to $400. Anything larger needs a team lead's approval before the customer is told.", c("handbook-refund-approval")],
            ["The refund goes back to the original payment method within 7 business days.", c("refund-annual")],
          ],
        },
      ],
      he: [
        { type: "p", content: ["מסלולים שנתיים זכאים להחזר מלא בתוך 30 יום ממועד הרכישה.", c("refund-annual")] },
        {
          type: "list",
          items: [
            ["לאחר 30 יום, החודשים שלא נוצלו מוחזרים באופן יחסי, בניכוי דמי ביטול מוקדם של 10%.", c("refund-annual")],
            ["נציג שירות רשאי לאשר החזר של עד ‎$400‎. סכום גבוה יותר דורש אישור ראש צוות לפני שמעדכנים את הלקוח.", c("handbook-refund-approval")],
            ["ההחזר מועבר לאמצעי התשלום המקורי בתוך 7 ימי עסקים.", c("refund-annual")],
          ],
        },
      ],
    },
    followUps: ["priority-one", "plan-comparison"],
  },
  {
    id: "priority-one",
    title: { en: "Priority 1 response times", he: "זמני תגובה בעדיפות 1" },
    question: {
      en: "How quickly do we have to respond to a Priority 1 ticket?",
      he: "תוך כמה זמן צריך להגיב לפנייה בעדיפות 1?",
    },
    answer: {
      en: [
        { type: "p", content: ["The first response is due within 30 minutes during business hours, followed by a status update every hour until the issue is resolved.", c("handbook-response")] },
        { type: "p", content: ["If the ticket is still open after 2 hours, the agent escalates it to the duty manager and records the escalation in the ticket.", c("handbook-escalation")] },
      ],
      he: [
        { type: "p", content: ["מענה ראשון נדרש בתוך 30 דקות בשעות הפעילות, ולאחריו עדכון סטטוס מדי שעה עד לפתרון התקלה.", c("handbook-response")] },
        { type: "p", content: ["אם הפנייה עדיין פתוחה לאחר שעתיים, הנציג מעביר אותה למנהל התורן ומתעד את ההסלמה בפנייה.", c("handbook-escalation")] },
      ],
    },
    followUps: ["annual-refunds", "first-week"],
  },
  {
    id: "first-week",
    title: { en: "First-week checklist", he: "משימות השבוע הראשון" },
    question: {
      en: "What does a new employee need to finish in their first week?",
      he: "מה עובד חדש צריך להשלים בשבוע הראשון שלו?",
    },
    answer: {
      en: [
        { type: "p", content: ["The onboarding guide sets three things for the first week:"] },
        {
          type: "list",
          items: [
            ["Day one: collect the laptop and access badge, and go through the team's tools with the onboarding buddy.", c("onboarding-day-one")],
            ["By the end of day three: complete the information security course. Access to client systems is granted only after passing it.", c("onboarding-training")],
            ["By the end of the week: submit payroll and tax forms to People Operations so the first salary is paid on time.", c("onboarding-payroll")],
          ],
        },
      ],
      he: [
        { type: "p", content: ["מדריך הקליטה מגדיר שלושה דברים לשבוע הראשון:"] },
        {
          type: "list",
          items: [
            ["ביום הראשון: לקבל מחשב נייד ותג כניסה, ולעבור עם החונך על הכלים של הצוות.", c("onboarding-day-one")],
            ["עד סוף היום השלישי: להשלים את קורס אבטחת המידע. גישה למערכות הלקוחות ניתנת רק לאחר מעבר הקורס.", c("onboarding-training")],
            ["עד סוף השבוע: להגיש את טופסי השכר והמס למשאבי אנוש, כדי שהמשכורת הראשונה תשולם במועד.", c("onboarding-payroll")],
          ],
        },
      ],
    },
    followUps: ["priority-one", "plan-comparison"],
  },
  {
    id: "plan-comparison",
    title: { en: "Bookkeeping plans compared", he: "השוואת מסלולי הנהלת חשבונות" },
    question: {
      en: "How do the Essentials and Growth bookkeeping plans differ?",
      he: "מה ההבדל בין מסלולי הנהלת החשבונות Essentials ו-Growth?",
    },
    answer: {
      en: [
        { type: "p", content: ["Growth handles four times the monthly volume and adds a named accountant and monthly reporting."] },
        {
          type: "table",
          head: [[""], ["Essentials", c("catalog-essentials")], ["Growth", c("catalog-growth")]],
          rows: [
            [["Transactions a month"], ["Up to 150"], ["Up to 600"]],
            [["Reporting"], ["Quarterly financial summary"], ["Monthly management reports"]],
            [["Named accountant"], ["Not mentioned"], ["Included"]],
            [["Price"], ["$290 a month"], ["$640 a month"]],
          ],
        },
      ],
      he: [
        { type: "p", content: ["מסלול Growth מטפל בנפח חודשי גדול פי ארבעה, ומוסיף רואה חשבון קבוע ודיווח חודשי."] },
        {
          type: "table",
          head: [[""], ["Essentials", c("catalog-essentials")], ["Growth", c("catalog-growth")]],
          rows: [
            [["תנועות בחודש"], ["עד 150"], ["עד 600"]],
            [["דיווח"], ["סיכום פיננסי רבעוני"], ["דוחות ניהוליים חודשיים"]],
            [["רואה חשבון קבוע"], ["לא מצוין"], ["כלול"]],
            [["מחיר"], ["‎$290‎ לחודש"], ["‎$640‎ לחודש"]],
          ],
        },
      ],
    },
    followUps: ["annual-refunds", "first-week"],
  },
];

export const getDocument = (id: string) => documents.find((d) => d.id === id);
export const getPassage = (id: string) => passages.find((p) => p.id === id);
export const getConversation = (id: string) => conversations.find((cv) => cv.id === id);

/** Passage ids cited by an answer, in order of first appearance. */
export function citedPassageIds(blocks: AnswerBlock[]): string[] {
  const seen: string[] = [];
  const visit = (inline: Inline) => {
    if (typeof inline !== "string" && !seen.includes(inline.cite)) seen.push(inline.cite);
  };
  for (const block of blocks) {
    if (block.type === "p") block.content.forEach(visit);
    else if (block.type === "list") block.items.forEach((item) => item.forEach(visit));
    else {
      block.head.forEach((cell) => cell.forEach(visit));
      block.rows.forEach((row) => row.forEach((cell) => cell.forEach(visit)));
    }
  }
  return seen;
}

export function answerToPlainText(blocks: AnswerBlock[]): string {
  const text = (inlines: Inline[]) =>
    inlines.filter((i): i is string => typeof i === "string").join(" ").trim();
  return blocks
    .map((block) => {
      if (block.type === "p") return text(block.content);
      if (block.type === "list") return block.items.map((item) => `- ${text(item)}`).join("\n");
      return [block.head, ...block.rows].map((row) => row.map(text).join(" | ")).join("\n");
    })
    .join("\n\n");
}
