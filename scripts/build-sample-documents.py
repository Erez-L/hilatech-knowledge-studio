#!/usr/bin/env python3
"""Builds the sample knowledge documents for the fictional company
"Northstar Business Services". Everything in them is invented.

Six documents, each in an English and a Hebrew edition with the same business
facts and the same page / section structure:

    samples/northstar/en/<name>.<ext>      samples/northstar/he/<name>.<ext>

Requires: reportlab, python-docx, python-bidi, and the DejaVu Sans fonts
(Debian/Ubuntu: fonts-dejavu-core).   Usage: python3 scripts/build-sample-documents.py

Hebrew PDFs: reportlab neither shapes nor reorders right-to-left text. Each
paragraph is therefore wrapped into lines here, in logical order, and only then
is every single line reordered for display (Unicode bidi algorithm) and drawn
right-aligned as one string. Reordering a whole paragraph before wrapping would
put its lines in the wrong order. scripts/check-samples.ts verifies the result
with the application's own extractor.
"""
import re
from pathlib import Path
from types import SimpleNamespace

from bidi import get_display
from docx import Document
from docx.oxml import OxmlElement
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).resolve().parent.parent / "samples" / "northstar"
AUTHOR = "Northstar Business Services (fictional)"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("DejaVuSans", str(FONT_DIR / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))

# --------------------------------------------------------------------------
# Business facts. Defined once and used by both editions, so that the English
# and the Hebrew text cannot drift apart on a number.
# --------------------------------------------------------------------------
F = SimpleNamespace(
    # support handbook
    desk_open="08:00", desk_close="18:00", desk_close_friday="13:00",
    filing_risk_hours="24",
    p1_first_response_minutes="30", p2_first_response_hours="4",
    p1_escalation_hours="2", p2_escalation_days="3",
    complaint_reply_days="5", close_after_days="5",
    agent_refund_limit="$400", finance_refund_threshold="$2,000",
    # refund and cancellation policy
    annual_months="12", full_refund_days="30", early_cancellation_fee="10%", refund_return_days="7",
    # catalog
    payroll_price="$180", payroll_employees="10", extra_employee_price="$12",
    essentials_price="$290", essentials_transactions="150", block_size="50", block_price="$40",
    growth_price="$640", growth_transactions="600",
    # onboarding guide
    reception_time="9:00", intro_minutes="30", goals_days="90", confidentiality_days="30",
    payday="9", probation_days="90", probation_review_days="45", vacation_accrual="1.5", vacation_notice_days="14",
    # remote work policy
    available_from="9:00", available_to="16:00", internet_allowance="100", reimbursement_day="25",
    # holiday schedule
    year="2027", spring_from="21", spring_to="28", summer_day="15",
    autumn_a_from="1", autumn_a_to="3", autumn_b_from="15", autumn_b_to="22",
)

FICTION = {
    "en": "Northstar Business Services is a fictional company. This document is sample content.",
    "he": "נורת'סטאר שירותים עסקיים היא חברה בדיונית. המסמך הזה הוא תוכן לדוגמה.",
}

# --------------------------------------------------------------------------
# PDF: English edition (plain reportlab paragraphs)
# --------------------------------------------------------------------------
H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=26, spaceAfter=10)
H2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=14, leading=19, spaceAfter=8)
BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=11, leading=17, spaceAfter=9)
NOTE = ParagraphStyle("note", fontName="Helvetica-Oblique", fontSize=9, leading=13, textColor=colors.grey)


def english_story(title, pages):
    story = [Paragraph(title, H1), Paragraph(FICTION["en"], NOTE), Spacer(1, 8 * mm)]
    for index, (heading, items) in enumerate(pages):
        if index:
            story.append(PageBreak())
        story.append(Paragraph(heading, H2))
        for item in items:
            if isinstance(item, tuple):
                table = Table(item[1], hAlign="LEFT")
                table.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]))
                story += [table, Spacer(1, 4 * mm)]
            else:
                story.append(Paragraph(item, BODY))
    return story


# --------------------------------------------------------------------------
# PDF: Hebrew edition (own line wrapping, then per-line bidi reordering)
# --------------------------------------------------------------------------
HE_H1 = ParagraphStyle("he-h1", fontName="DejaVuSans-Bold", fontSize=20, leading=26, spaceAfter=10)
HE_H2 = ParagraphStyle("he-h2", fontName="DejaVuSans-Bold", fontSize=14, leading=19, spaceAfter=8)
HE_BODY = ParagraphStyle("he-body", fontName="DejaVuSans", fontSize=11, leading=17, spaceAfter=9)
HE_NOTE = ParagraphStyle("he-note", fontName="DejaVuSans", fontSize=9, leading=13, textColor=colors.grey)


RTL_CHARS = re.compile("[\u0590-\u08ff]")


def visual(line):
    """One line of logical-order text -> the left-to-right glyph order a PDF needs.
    A line without any right-to-left character (the heading "3. Payroll Basic")
    is left alone: it is a left-to-right line that merely sits on the right."""
    return get_display(line, base_dir="R") if RTL_CHARS.search(line) else line


def wrap_logical(text, font, size, width):
    """Greedy word wrap on the logical-order text. Glyph widths do not depend on order."""
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}" if current else word
        if current and pdfmetrics.stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    return lines + [current] if current else lines


class RtlParagraph(Flowable):
    """A right-aligned paragraph of right-to-left text; every line is drawn as one string."""

    def __init__(self, text, style):
        super().__init__()
        self.text, self.style = text, style

    def wrap(self, avail_width, avail_height):
        self.lines = wrap_logical(self.text, self.style.fontName, self.style.fontSize, avail_width)
        self.width, self.height = avail_width, len(self.lines) * self.style.leading
        return self.width, self.height

    def draw(self):
        style = self.style
        self.canv.setFont(style.fontName, style.fontSize)
        self.canv.setFillColor(style.textColor)
        baseline = self.height - style.fontSize
        for line in self.lines:
            self.canv.drawRightString(self.width, baseline, visual(line))
            baseline -= style.leading


class RtlTable(Flowable):
    """A table whose first column is on the right.

    The text is written column by column (right to left, each column top to
    bottom), not row by row. Text extractors follow the order in the file: they
    put a space between two strings when the second lies to the right of the
    first, but glue them together when it lies to the left on the same line,
    which is what a row written right-to-left looks like. Column order gives
    extracted text in which every plan name is followed by its own values."""

    FONT, BOLD, SIZE, PAD, ROW = "DejaVuSans", "DejaVuSans-Bold", 10, 6, 22

    def __init__(self, rows):
        super().__init__()
        self.rows = rows

    def font(self, row):
        return self.BOLD if row == 0 else self.FONT

    def wrap(self, avail_width, avail_height):
        columns = range(len(self.rows[0]))
        self.widths = [2 * self.PAD + max(pdfmetrics.stringWidth(row[c], self.font(r), self.SIZE)
                                          for r, row in enumerate(self.rows)) for c in columns]
        self.width, self.height = avail_width, self.ROW * len(self.rows)
        return self.width, self.height

    def draw(self):
        canvas, total = self.canv, sum(self.widths)
        canvas.setStrokeColor(colors.lightgrey)
        canvas.setLineWidth(0.5)
        canvas.grid([self.width - total + sum(self.widths[::-1][:i]) for i in range(len(self.widths) + 1)],
                    [self.ROW * i for i in range(len(self.rows) + 1)])
        canvas.setFillColor(colors.black)
        right = self.width
        for c, column_width in enumerate(self.widths):
            for r, row in enumerate(self.rows):
                if row[c]:
                    canvas.setFont(self.font(r), self.SIZE)
                    canvas.drawRightString(right - self.PAD, self.height - self.ROW * r - 15, visual(row[c]))
            right -= column_width


def hebrew_story(title, pages):
    story = [RtlParagraph(title, HE_H1), RtlParagraph(FICTION["he"], HE_NOTE), Spacer(1, 8 * mm)]
    for index, (heading, items) in enumerate(pages):
        if index:
            story.append(PageBreak())
        story.append(RtlParagraph(heading, HE_H2))
        for item in items:
            if isinstance(item, tuple):
                story += [RtlTable(item[1]), Spacer(1, 4 * mm)]
            else:
                story.append(RtlParagraph(item, HE_BODY))
    return story


def pdf(lang, filename, title, pages):
    """pages: list of (heading, [paragraph | ('table', rows)]); one page per entry."""
    def footer(canvas, doc):
        canvas.setFillColor(colors.grey)
        if lang == "he":
            canvas.setFont("DejaVuSans", 8)
            canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, visual(f"{title} | עמוד {doc.page}"))
        else:
            canvas.setFont("Helvetica", 8)
            canvas.drawString(20 * mm, 12 * mm, f"{title} | Page {doc.page}")

    story = hebrew_story(title, pages) if lang == "he" else english_story(title, pages)
    SimpleDocTemplate(str(OUT / lang / filename), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=22 * mm, bottomMargin=22 * mm, title=title, author=AUTHOR, lang=lang,
                      subject="Sample content" if lang == "en" else "תוכן לדוגמה",
                      ).build(story, onFirstPage=footer, onLaterPages=footer)


# --------------------------------------------------------------------------
# DOCX
# --------------------------------------------------------------------------
def docx(lang, filename, title, sections):
    """sections: list of (heading, level, [paragraph])."""
    rtl = lang == "he"
    document = Document()
    properties = document.core_properties
    properties.title, properties.author, properties.last_modified_by = title, AUTHOR, AUTHOR
    properties.language = "he-IL" if rtl else "en-US"
    properties.subject = "תוכן לדוגמה" if rtl else "Sample content"

    def add(text, style=None):
        paragraph = document.add_heading(text, level=style) if isinstance(style, int) else document.add_paragraph(text)
        if rtl:
            # Right-to-left paragraph and runs, so Word lays out mixed text (digits, "VPN") correctly.
            # No explicit alignment: a right-to-left paragraph starts at the right by default.
            paragraph._p.get_or_add_pPr().append(OxmlElement("w:bidi"))  # schema order: after w:pStyle
            for run in paragraph.runs:
                run._r.get_or_add_rPr().append(OxmlElement("w:rtl"))
        return paragraph

    add(title, 0)
    add(FICTION[lang])
    for heading, level, paragraphs in sections:
        add(heading, level)
        for paragraph in paragraphs:
            add(paragraph)
    document.save(str(OUT / lang / filename))


# ==========================================================================
# Content
# ==========================================================================

# ---- Customer Support Handbook (PDF, 12 pages) ---------------------------
HANDBOOK = {
    "en": ("Customer Support Handbook", [
        ("1. Purpose of this handbook", [
            "This handbook describes how the Northstar support team works with customers. It applies to every support agent, team lead and duty manager.",
            "Northstar provides bookkeeping, payroll and back-office services to small businesses. Most customer questions are about invoices, reports, payroll runs and changes to a service plan.",
            "When this handbook and a customer contract disagree, the contract takes priority. Raise the conflict with your team lead."]),
        ("2. Support hours and channels", [
            f"The support desk is open Sunday to Thursday, {F.desk_open} to {F.desk_close}, and Friday, {F.desk_open} to {F.desk_close_friday}. Outside these hours an on-call duty manager handles Priority 1 tickets only.",
            "Customers can reach support by email, through the customer portal, or by phone. Every contact, including a phone call, is recorded as a ticket in the help desk before work starts.",
            "Chat is offered to customers on the Growth plan and above."]),
        ("3. Opening a ticket", [
            "Each ticket has one owner. The agent who opens the ticket owns it until it is resolved or handed over in writing.",
            "A ticket must contain the customer name, the affected service, a description in the customer's own words, and the priority.",
            "Do not ask customers to send passwords, full card numbers or bank login details. If a customer sends them, delete the message and tell the customer to change the credential."]),
        ("4. Priorities", [
            f"Priority 1: the customer cannot run payroll, cannot issue invoices, or has a filing deadline within {F.filing_risk_hours} hours that is at risk.",
            "Priority 2: a service is degraded but the customer can keep working, for example a report shows wrong totals.",
            "Priority 3: questions, how-to requests and change requests with no deadline.",
            "If you are unsure between two priorities, choose the higher one and note why."]),
        ("5. Tone and language", [
            "Write the way you would explain something to a colleague: short sentences, no jargon, and one request per message.",
            "Answer in the language the customer wrote in. Northstar supports customers in English and Hebrew.",
            "Never blame the customer, another team or a supplier. Describe what happened and what happens next."]),
        ("6. Verifying the customer", [
            "Before discussing account details, confirm that the person is a named contact on the account. Check the email address against the contact list.",
            "For phone calls, ask for the account number and the amount of the last invoice. If either is wrong, offer to call back on the number on file."]),
        ("7. Response targets", [
            "Every ticket is given a priority when it is opened. The priority decides how quickly the customer hears from us.",
            f"Priority 1 tickets receive a first response within {F.p1_first_response_minutes} minutes during business hours, and a status update every hour until the issue is resolved.",
            f"Priority 2 tickets receive a first response within {F.p2_first_response_hours} business hours. Priority 3 tickets receive a first response within 1 business day.",
            "A first response is a message from a person that says who owns the ticket and what happens next. An automatic acknowledgement does not count."]),
        ("8. Escalation", [
            "Escalation exists so that no urgent ticket depends on a single person.",
            f"If a Priority 1 ticket is still open after {F.p1_escalation_hours} hours, the agent escalates it to the duty manager and records the escalation in the ticket.",
            f"The duty manager decides whether to bring in the account owner. A Priority 2 ticket that is open for more than {F.p2_escalation_days} business days is escalated to the team lead.",
            "Escalating a ticket does not transfer ownership. The agent stays the customer's point of contact."]),
        ("9. Handing over a ticket", [
            "Hand over a ticket only at the end of a shift or before planned leave. Write a handover note with the current status, what was promised to the customer and by when.",
            "The receiving agent confirms the handover in the ticket. Until then the original agent remains the owner."]),
        ("10. Complaints", [
            "A complaint is any message in which a customer says they are unhappy with Northstar, whatever the channel.",
            f"Acknowledge a complaint within 1 business day. The team lead reviews every complaint and replies in full within {F.complaint_reply_days} business days.",
            "Complaints are logged in the complaints register, separately from the ticket."]),
        ("11. Refund approvals", [
            "Refund requests are checked against the Refund and Cancellation Policy before any amount is promised.",
            f"Support agents may approve refunds of up to {F.agent_refund_limit} on their own. Larger refunds need approval from a team lead before the customer is told.",
            f"Refunds above {F.finance_refund_threshold} also need approval from the finance manager.",
            "Every approved refund is logged with the ticket number."]),
        ("12. Closing a ticket", [
            f"Close a ticket when the customer confirms the issue is resolved, or {F.close_after_days} business days after the last message if the customer does not reply.",
            "Before closing, write a one-line summary of the cause and the fix. These summaries are reviewed every month to find repeated problems."]),
    ]),
    "he": ("מדריך תמיכת לקוחות", [
        ("1. מטרת המדריך", [
            "המדריך מתאר איך צוות התמיכה של נורת'סטאר עובד מול לקוחות. הוא חל על כל נציגי התמיכה, ראשי הצוותים והמנהלים התורנים.",
            "נורת'סטאר מספקת שירותי הנהלת חשבונות, שכר ומשרד אחורי לעסקים קטנים. רוב שאלות הלקוחות עוסקות בחשבוניות, בדוחות, בהרצות שכר ובשינויים בתוכנית השירות.",
            "כאשר יש סתירה בין המדריך לבין חוזה של לקוח, החוזה גובר. יש להעלות את הסתירה מול ראש הצוות."]),
        ("2. שעות התמיכה וערוצי הפנייה", [
            f"מוקד התמיכה פתוח בימים ראשון עד חמישי, {F.desk_open} עד {F.desk_close}, וביום שישי, {F.desk_open} עד {F.desk_close_friday}. מחוץ לשעות האלה מנהל תורן מטפל בפניות בעדיפות 1 בלבד.",
            "לקוחות יכולים לפנות לתמיכה בדוא\"ל, דרך פורטל הלקוחות או בטלפון. כל פנייה, כולל שיחת טלפון, נרשמת כפנייה במערכת התמיכה לפני שמתחילים לעבוד עליה.",
            "צ'אט מוצע ללקוחות בתוכנית Growth ומעלה."]),
        ("3. פתיחת פנייה", [
            "לכל פנייה יש בעלים אחד. הנציג שפתח את הפנייה אחראי לה עד שהיא נפתרת או מועברת בכתב.",
            "פנייה חייבת לכלול את שם הלקוח, את השירות שנפגע, תיאור במילים של הלקוח ואת העדיפות.",
            "אין לבקש מלקוחות לשלוח סיסמאות, מספרי כרטיס מלאים או פרטי כניסה לחשבון הבנק. אם לקוח שלח אותם, יש למחוק את ההודעה ולבקש מהלקוח להחליף את פרטי הגישה."]),
        ("4. עדיפויות", [
            f"עדיפות 1: הלקוח אינו יכול להריץ שכר, אינו יכול להפיק חשבוניות, או שמועד דיווח שחל בתוך {F.filing_risk_hours} שעות נמצא בסיכון.",
            "עדיפות 2: שירות פועל באופן חלקי אבל הלקוח יכול להמשיך לעבוד, למשל דוח שמציג סכומים שגויים.",
            "עדיפות 3: שאלות, בקשות הדרכה ובקשות שינוי ללא מועד יעד.",
            "אם יש התלבטות בין שתי עדיפויות, יש לבחור בגבוהה מביניהן ולציין מדוע."]),
        ("5. טון ושפה", [
            "כתבו כפי שהייתם מסבירים משהו לעמית: משפטים קצרים, בלי ז'רגון, ובקשה אחת בכל הודעה.",
            "ענו בשפה שבה הלקוח כתב. נורת'סטאר תומכת בלקוחות באנגלית ובעברית.",
            "לעולם אין להאשים את הלקוח, צוות אחר או ספק. תארו מה קרה ומה יקרה בהמשך."]),
        ("6. אימות זהות הלקוח", [
            "לפני שמדברים על פרטי החשבון, יש לוודא שהפונה הוא איש קשר רשום בחשבון. בדקו את כתובת הדוא\"ל מול רשימת אנשי הקשר.",
            "בשיחות טלפון, בקשו את מספר החשבון ואת סכום החשבונית האחרונה. אם אחד מהם שגוי, הציעו לחזור אל הלקוח במספר הטלפון הרשום במערכת."]),
        ("7. יעדי זמן תגובה", [
            "כל פנייה מקבלת עדיפות כשהיא נפתחת. העדיפות קובעת כמה מהר הלקוח שומע מאיתנו.",
            f"פניות בעדיפות 1 מקבלות תגובה ראשונה בתוך {F.p1_first_response_minutes} דקות בשעות הפעילות, ועדכון סטטוס בכל שעה עד שהתקלה נפתרת.",
            f"פניות בעדיפות 2 מקבלות תגובה ראשונה בתוך {F.p2_first_response_hours} שעות עבודה. פניות בעדיפות 3 מקבלות תגובה ראשונה בתוך יום עסקים אחד.",
            "תגובה ראשונה היא הודעה מאדם שמציינת מי אחראי לפנייה ומה יקרה בהמשך. אישור קבלה אוטומטי אינו נחשב."]),
        ("8. הסלמה", [
            "ההסלמה קיימת כדי ששום פנייה דחופה לא תהיה תלויה באדם יחיד.",
            f"אם פנייה בעדיפות 1 עדיין פתוחה אחרי {F.p1_escalation_hours} שעות, הנציג מסלים אותה למנהל התורן ומתעד את ההסלמה בפנייה.",
            f"המנהל התורן מחליט אם לערב את מנהל הלקוח. פנייה בעדיפות 2 שפתוחה יותר מ-{F.p2_escalation_days} ימי עסקים מוסלמת לראש הצוות.",
            "הסלמה של פנייה אינה מעבירה את האחריות עליה. הנציג נשאר איש הקשר של הלקוח."]),
        ("9. העברת פנייה", [
            "מעבירים פנייה רק בסוף משמרת או לפני חופשה מתוכננת. יש לכתוב הערת העברה עם הסטטוס הנוכחי, מה הובטח ללקוח ועד מתי.",
            "הנציג המקבל מאשר את ההעברה בפנייה. עד אז הנציג המקורי נשאר האחראי."]),
        ("10. תלונות", [
            "תלונה היא כל הודעה שבה לקוח אומר שהוא אינו מרוצה מנורת'סטאר, בכל ערוץ שהוא.",
            f"יש לאשר קבלת תלונה בתוך יום עסקים אחד. ראש הצוות בוחן כל תלונה ומשיב תשובה מלאה בתוך {F.complaint_reply_days} ימי עסקים.",
            "תלונות נרשמות במרשם התלונות, בנפרד מהפנייה."]),
        ("11. אישור החזרים כספיים", [
            "בקשות להחזר כספי נבדקות מול נוהל ההחזרים והביטולים לפני שמבטיחים סכום כלשהו.",
            f"נציגי תמיכה רשאים לאשר בעצמם החזרים כספיים של עד {F.agent_refund_limit}. החזרים גדולים יותר דורשים אישור של ראש צוות לפני שמודיעים ללקוח.",
            f"החזרים מעל {F.finance_refund_threshold} דורשים גם אישור של מנהל הכספים.",
            "כל החזר שאושר מתועד יחד עם מספר הפנייה."]),
        ("12. סגירת פנייה", [
            f"סוגרים פנייה כשהלקוח מאשר שהתקלה נפתרה, או {F.close_after_days} ימי עסקים אחרי ההודעה האחרונה אם הלקוח אינו משיב.",
            "לפני הסגירה יש לכתוב סיכום בן שורה אחת על הסיבה ועל התיקון. הסיכומים האלה נבדקים מדי חודש כדי לאתר בעיות חוזרות."]),
    ]),
}

# ---- Refund and Cancellation Policy (PDF, 4 pages) -----------------------
REFUND_POLICY = {
    "en": ("Refund and Cancellation Policy", [
        ("1. Scope", [
            "This policy explains when Northstar refunds a payment and how a customer can cancel a service plan. It applies to all bookkeeping and payroll plans.",
            "One-off projects, such as a historical clean-up of accounts, are covered by the project agreement and not by this policy."]),
        ("2. Monthly plans", [
            "Monthly plans can be cancelled at any time. The current month is not refunded.",
            "Cancellation takes effect at the end of the billing month in which the request is received. The customer keeps access to reports until that date."]),
        ("3. Annual plans", [
            f"Annual plans are paid in advance for {F.annual_months} months.",
            f"Annual plans can be refunded in full within {F.full_refund_days} days of purchase. After {F.full_refund_days} days, the unused months are refunded pro rata, less a {F.early_cancellation_fee} early-cancellation fee.",
            f"Refunds are returned to the original payment method within {F.refund_return_days} business days.",
            "A month that has already started counts as used."]),
        ("4. How to cancel and exceptions", [
            "A cancellation request must come from a named contact on the account, in writing, by email or through the customer portal.",
            "Northstar waives the early-cancellation fee when a customer cancels because Northstar missed a filing deadline that was Northstar's responsibility.",
            "Setup fees are not refundable once onboarding has started."]),
    ]),
    "he": ("נוהל החזרים וביטולים", [
        ("1. תחולה", [
            "הנוהל מסביר מתי נורת'סטאר מחזירה תשלום ואיך לקוח יכול לבטל תוכנית שירות. הוא חל על כל תוכניות הנהלת החשבונות והשכר.",
            "פרויקטים חד-פעמיים, כמו הסדרה של חשבונות מהעבר, מוסדרים בהסכם הפרויקט ולא בנוהל הזה."]),
        ("2. תוכניות חודשיות", [
            "אפשר לבטל תוכנית חודשית בכל עת. החודש הנוכחי אינו מוחזר.",
            "הביטול נכנס לתוקף בסוף חודש החיוב שבו התקבלה הבקשה. הלקוח שומר על גישה לדוחות עד לאותו מועד."]),
        ("3. תוכניות שנתיות", [
            f"תוכניות שנתיות משולמות מראש ל-{F.annual_months} חודשים.",
            f"תוכנית שנתית זכאית להחזר מלא בתוך {F.full_refund_days} יום ממועד הרכישה. אחרי {F.full_refund_days} יום, החודשים שלא נוצלו מוחזרים באופן יחסי, בניכוי דמי ביטול מוקדם של {F.early_cancellation_fee}.",
            f"ההחזר מועבר לאמצעי התשלום המקורי בתוך {F.refund_return_days} ימי עסקים.",
            "חודש שכבר התחיל נחשב חודש שנוצל."]),
        ("4. איך מבטלים וחריגים", [
            "בקשת ביטול חייבת להגיע מאיש קשר רשום בחשבון, בכתב, בדוא\"ל או דרך פורטל הלקוחות.",
            "נורת'סטאר מוותרת על דמי הביטול המוקדם כאשר לקוח מבטל משום שנורת'סטאר החמיצה מועד דיווח שהיה באחריותה.",
            "דמי הקמה אינם מוחזרים לאחר שתהליך הקליטה התחיל."]),
    ]),
}

# ---- Product and Service Catalog (PDF, 6 pages) --------------------------
PLAN_NAMES = ["Payroll Basic", "Bookkeeping Essentials", "Bookkeeping Growth"]  # not translated
CATALOG = {
    "en": ("Product and Service Catalog", [
        ("1. About this catalog", [
            "This catalog lists the service plans Northstar offers to small businesses, with what each plan includes and its monthly price in US dollars.",
            "Prices are for businesses with one legal entity. Groups with several entities receive a written quote."]),
        ("2. How plans are billed", [
            "Plans are billed monthly in advance, or annually in advance with two months free.",
            "Transaction limits are counted per calendar month. A transaction is one bank line, invoice or receipt."]),
        ("3. Payroll Basic", [
            f"Payroll Basic covers monthly payroll for up to {F.payroll_employees} employees, payslips, and the monthly filing to the tax authority, for {F.payroll_price} a month.",
            f"Each additional employee costs {F.extra_employee_price} a month."]),
        ("4. Bookkeeping Essentials", [
            "Our entry plan, for businesses that need their books kept in order each month.",
            f"Bookkeeping Essentials covers up to {F.essentials_transactions} transactions a month, monthly bank reconciliation and a quarterly financial summary, for {F.essentials_price} a month.",
            f"Additional transactions are billed in blocks of {F.block_size}, at {F.block_price} per block.",
            "Support is by email, with replies within 1 business day."]),
        ("5. Bookkeeping Growth", [
            "For businesses that want a closer view of their numbers.",
            f"Bookkeeping Growth covers up to {F.growth_transactions} transactions a month, adds a named accountant and monthly management reports, and costs {F.growth_price} a month.",
            "Payroll can be added to either bookkeeping plan.",
            "Growth customers can also reach support by chat."]),
        ("6. Plan comparison", [
            ("table", [
                ["", *PLAN_NAMES],
                ["Monthly price", F.payroll_price, F.essentials_price, F.growth_price],
                ["Included volume", f"{F.payroll_employees} employees", f"{F.essentials_transactions} transactions", f"{F.growth_transactions} transactions"],
                ["Reports", "Payslips", "Quarterly summary", "Monthly management reports"],
                ["Named accountant", "No", "No", "Yes"],
            ]),
            "A customer can move to a higher plan at any time. The change applies from the next billing month."]),
    ]),
    "he": ("קטלוג מוצרים ושירותים", [
        ("1. על הקטלוג", [
            "הקטלוג מפרט את תוכניות השירות שנורת'סטאר מציעה לעסקים קטנים, מה כוללת כל תוכנית ומה מחירה החודשי בדולר אמריקאי.",
            "המחירים מיועדים לעסקים עם ישות משפטית אחת. קבוצות עם כמה ישויות מקבלות הצעת מחיר בכתב."]),
        ("2. איך מחויבות התוכניות", [
            "התוכניות מחויבות מראש מדי חודש, או מראש לשנה עם חודשיים חינם.",
            "מכסות התנועות נספרות לפי חודש קלנדרי. תנועה היא שורת בנק, חשבונית או קבלה אחת."]),
        ("3. Payroll Basic", [
            f"Payroll Basic כוללת שכר חודשי לעד {F.payroll_employees} עובדים, תלושי שכר והדיווח החודשי לרשות המסים, במחיר של {F.payroll_price} לחודש.",
            f"כל עובד נוסף עולה {F.extra_employee_price} לחודש."]),
        ("4. Bookkeeping Essentials", [
            "תוכנית הכניסה שלנו, לעסקים שצריכים שהספרים שלהם יהיו מסודרים בכל חודש.",
            f"Bookkeeping Essentials כוללת עד {F.essentials_transactions} תנועות בחודש, התאמת בנקים חודשית וסיכום כספי רבעוני, במחיר של {F.essentials_price} לחודש.",
            f"תנועות נוספות מחויבות בחבילות של {F.block_size}, במחיר של {F.block_price} לחבילה.",
            "התמיכה ניתנת בדוא\"ל, עם מענה בתוך יום עסקים אחד."]),
        ("5. Bookkeeping Growth", [
            "לעסקים שרוצים מבט קרוב יותר על המספרים שלהם.",
            f"Bookkeeping Growth כוללת עד {F.growth_transactions} תנועות בחודש, מוסיפה רואה חשבון קבוע ודוחות ניהוליים חודשיים, ועולה {F.growth_price} לחודש.",
            "אפשר להוסיף שכר לכל אחת מתוכניות הנהלת החשבונות.",
            "לקוחות Growth יכולים לפנות לתמיכה גם בצ'אט."]),
        ("6. השוואת תוכניות", [
            ("table", [
                ["", *PLAN_NAMES],
                ["מחיר חודשי", F.payroll_price, F.essentials_price, F.growth_price],
                ["היקף כלול", f"{F.payroll_employees} עובדים", f"{F.essentials_transactions} תנועות", f"{F.growth_transactions} תנועות"],
                ["דוחות", "תלושי שכר", "סיכום רבעוני", "דוחות ניהוליים חודשיים"],
                ["רואה חשבון קבוע", "לא", "לא", "כן"],
            ]),
            "לקוח יכול לעבור לתוכנית גבוהה יותר בכל עת. השינוי חל מחודש החיוב הבא."]),
    ]),
}

# ---- Employee Onboarding Guide (DOCX) ------------------------------------
ONBOARDING = {
    "en": ("Employee Onboarding Guide", [
        ("1. Before you start", 1, []),
        ("1.1 What we send you", 2, [
            "One week before your start date you receive a welcome email with your start time, the name of your onboarding buddy, and the forms you need to complete.",
            "If you have not received the email three working days before you start, write to People Operations."]),
        ("1.2 What to bring", 2, [
            "Bring an official photo ID and your bank account details on your first day. You do not need to bring a laptop."]),
        ("2. Your first week", 1, []),
        ("2.1 Your first day", 2, [
            f"People Operations will meet you at reception at {F.reception_time}.",
            "On day one you receive your laptop and access badge, and your onboarding buddy walks you through the tools your team uses.",
            "Lunch on the first day is with your team."]),
        ("2.2 Meeting your team", 2, [
            f"During the first week you have a {F.intro_minutes}-minute introduction with each person on your team, and one with your manager to agree on goals for the first {F.goals_days} days."]),
        ("2.3 Required training", 2, [
            "Two courses are required for every new employee, whatever the role.",
            "Complete the information security course by the end of day three. Access to client systems is granted only after the course is passed.",
            f"The second course, on client confidentiality, is due within {F.confidentiality_days} days."]),
        ("2.4 Payroll and paperwork", 2, [
            "The forms you need are in your welcome email.",
            "Submit your payroll and tax forms to People Operations by the end of your first week so that your first salary is paid on time.",
            f"Salaries are paid on the {F.payday}th of each month. Questions about forms go to the People Operations desk."]),
        ("3. After the first week", 1, []),
        ("3.1 Probation", 2, [
            f"The probation period is {F.probation_days} days. Your manager holds a review with you after {F.probation_review_days} days and again at the end of probation."]),
        ("3.2 Time off", 2, [
            f"You accrue {F.vacation_accrual} vacation days for each month worked. Vacation requests are made in the HR system at least {F.vacation_notice_days} days in advance."]),
    ]),
    "he": ("מדריך קליטה לעובדים חדשים", [
        ("1. לפני שמתחילים", 1, []),
        ("1.1 מה אנחנו שולחים לכם", 2, [
            "שבוע לפני מועד תחילת העבודה תקבלו דוא\"ל קבלת פנים עם שעת ההתחלה, שם החונך שילווה אתכם בקליטה והטפסים שעליכם למלא.",
            "אם לא קיבלתם את הדוא\"ל שלושה ימי עבודה לפני תחילת העבודה, כתבו למחלקת משאבי אנוש."]),
        ("1.2 מה להביא", 2, [
            "הביאו ביום הראשון תעודה מזהה רשמית עם תמונה ואת פרטי חשבון הבנק שלכם. אין צורך להביא מחשב נייד."]),
        ("2. השבוע הראשון שלכם", 1, []),
        ("2.1 היום הראשון", 2, [
            f"נציג משאבי אנוש יפגוש אתכם בקבלה בשעה {F.reception_time}.",
            "ביום הראשון תקבלו מחשב נייד ותג כניסה, והחונך שלכם יעבור איתכם על הכלים שהצוות שלכם משתמש בהם.",
            "ארוחת הצהריים ביום הראשון היא עם הצוות שלכם."]),
        ("2.2 היכרות עם הצוות", 2, [
            f"במהלך השבוע הראשון תתקיים פגישת היכרות של {F.intro_minutes} דקות עם כל אחד מחברי הצוות, ופגישה עם המנהל שלכם לקביעת יעדים ל-{F.goals_days} הימים הראשונים."]),
        ("2.3 הדרכות חובה", 2, [
            "שתי הדרכות הן חובה לכל עובד חדש, בכל תפקיד.",
            "יש להשלים את הדרכת אבטחת המידע עד סוף היום השלישי. גישה למערכות של לקוחות ניתנת רק לאחר שעוברים את ההדרכה בהצלחה.",
            f"את ההדרכה השנייה, בנושא סודיות לקוחות, יש להשלים בתוך {F.confidentiality_days} יום."]),
        ("2.4 שכר וטפסים", 2, [
            "הטפסים הדרושים נמצאים בדוא\"ל קבלת הפנים.",
            "הגישו את טופסי השכר והמס למשאבי אנוש עד סוף השבוע הראשון, כדי שהמשכורת הראשונה תשולם בזמן.",
            f"המשכורות משולמות ב-{F.payday} בכל חודש. שאלות על טפסים מפנים לדלפק משאבי אנוש."]),
        ("3. אחרי השבוע הראשון", 1, []),
        ("3.1 תקופת ניסיון", 2, [
            f"תקופת הניסיון היא {F.probation_days} יום. המנהל שלכם מקיים איתכם שיחת משוב אחרי {F.probation_review_days} יום ושוב בסוף תקופת הניסיון."]),
        ("3.2 חופשה", 2, [
            f"אתם צוברים {F.vacation_accrual} ימי חופשה על כל חודש עבודה. בקשות חופשה מוגשות במערכת משאבי האנוש לפחות {F.vacation_notice_days} יום מראש."]),
    ]),
}

# ---- Remote Work Policy (DOCX). Written in Hebrew first; the English is a translation.
REMOTE_WORK = {
    "en": ("Remote Work Policy", [
        ("1. Purpose of this policy", 1, [
            "This policy defines when and how Northstar employees may work outside the office. It applies to all full-time and part-time employees."]),
        ("2. Work-from-home days", 1, [
            "Employees may work from home up to three days a week, agreed in advance with their direct manager.",
            "Tuesdays are office days for all teams, and remote work on Tuesdays is not allowed without special approval."]),
        ("3. Availability", 1, [
            f"On remote work days you must be available between {F.available_from} and {F.available_to} by phone and on the company chat.",
            "Meetings with customers are held by video with the camera on."]),
        ("4. Equipment and information security", 1, [
            "Remote work is done only on the company laptop and through a VPN connection.",
            "Do not save customer files on a personal computer or print them at home.",
            "The loss or theft of a computer must be reported to the information security team within an hour."]),
        ("5. Expense reimbursement", 1, [
            f"The company contributes {F.internet_allowance} NIS a month towards home internet costs for employees who work from home at least two days a week.",
            f"Reimbursement requests are submitted in the payroll system by the {F.reimbursement_day}th of each month."]),
    ]),
    "he": ("נוהל עבודה מרחוק", [
        ("1. מטרת הנוהל", 1, [
            "הנוהל מגדיר מתי ואיך עובדי נורת'סטאר רשאים לעבוד מחוץ למשרד. הוא חל על כל העובדים במשרה מלאה ובמשרה חלקית."]),
        ("2. ימי עבודה מהבית", 1, [
            "עובדים רשאים לעבוד מהבית עד שלושה ימים בשבוע, בתיאום מראש עם המנהל הישיר.",
            "ימי שלישי הם ימי משרד לכל הצוותים, ואין לעבוד בהם מרחוק ללא אישור מיוחד."]),
        ("3. זמינות", 1, [
            f"בימי עבודה מרחוק יש להיות זמינים בין השעות {F.available_from} ל-{F.available_to} בטלפון ובצ'אט הארגוני.",
            "פגישות עם לקוחות מתקיימות בווידאו עם מצלמה פתוחה."]),
        ("4. ציוד ואבטחת מידע", 1, [
            "העבודה מרחוק מתבצעת רק במחשב הנייד של החברה ודרך חיבור VPN.",
            "אין לשמור קובצי לקוחות על מחשב פרטי או להדפיס אותם בבית.",
            "אובדן או גניבה של מחשב יש לדווח לצוות אבטחת המידע בתוך שעה."]),
        ("5. החזר הוצאות", 1, [
            f"החברה משתתפת בהוצאות אינטרנט ביתי בסך {F.internet_allowance} ש\"ח בחודש לעובדים שעובדים מהבית יומיים בשבוע לפחות.",
            f"בקשות להחזר מוגשות במערכת השכר עד ה-{F.reimbursement_day} בכל חודש."]),
    ]),
}

# ---- Office Holiday Schedule (TXT) ---------------------------------------
HOLIDAYS = {
    "en": (
        f"Northstar Business Services - Office Holiday Schedule {F.year}\n"
        "(Northstar Business Services is a fictional company. This file is sample content.)\n\n"
        "The office is closed on the dates below. Support for Priority 1 tickets continues through the on-call duty manager.\n\n"
        f"Spring closure: {F.spring_from} April to {F.spring_to} April {F.year}.\n"
        f"Summer closure: {F.summer_day} August {F.year}, one day.\n"
        f"Autumn closure: {F.autumn_a_from} October to {F.autumn_a_to} October {F.year}, and {F.autumn_b_from} October to {F.autumn_b_to} October {F.year}.\n\n"
        "Payroll runs that fall inside a closure are processed on the last working day before it.\n"
        "Customers are told about each closure by email two weeks in advance.\n"),
    "he": (
        f"נורת'סטאר שירותים עסקיים - לוח חופשות המשרד לשנת {F.year}\n"
        "(נורת'סטאר שירותים עסקיים היא חברה בדיונית. הקובץ הזה הוא תוכן לדוגמה.)\n\n"
        "המשרד סגור בתאריכים שלהלן. התמיכה בפניות בעדיפות 1 נמשכת באמצעות המנהל התורן.\n\n"
        f"סגירת אביב: {F.spring_from} באפריל עד {F.spring_to} באפריל {F.year}.\n"
        f"סגירת קיץ: {F.summer_day} באוגוסט {F.year}, יום אחד.\n"
        f"סגירת סתיו: {F.autumn_a_from} באוקטובר עד {F.autumn_a_to} באוקטובר {F.year}, ו-{F.autumn_b_from} באוקטובר עד {F.autumn_b_to} באוקטובר {F.year}.\n\n"
        "הרצות שכר שחלות בתוך תקופת סגירה מבוצעות ביום העבודה האחרון שלפניה.\n"
        "הלקוחות מקבלים הודעה בדוא\"ל על כל סגירה שבועיים מראש.\n"),
}

# ==========================================================================
# Build
# ==========================================================================
if __name__ == "__main__":
    for lang in ("en", "he"):
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        pdf(lang, "customer-support-handbook.pdf", *HANDBOOK[lang])
        pdf(lang, "refund-and-cancellation-policy.pdf", *REFUND_POLICY[lang])
        pdf(lang, "product-and-service-catalog.pdf", *CATALOG[lang])
        docx(lang, "employee-onboarding-guide.docx", *ONBOARDING[lang])
        docx(lang, "remote-work-policy.docx", *REMOTE_WORK[lang])
        (OUT / lang / f"holiday-schedule-{F.year}.txt").write_text(HOLIDAYS[lang], encoding="utf-8")
        print(f"built {lang}:", ", ".join(sorted(p.name for p in (OUT / lang).iterdir())))
