#!/usr/bin/env python3
"""Builds the sample knowledge documents for the fictional company
"Northstar Business Services". Everything in them is invented.

Requires: reportlab, python-docx.   Usage: python3 scripts/build-sample-documents.py
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH

OUT = Path(__file__).resolve().parent.parent / "samples" / "northstar"
OUT.mkdir(parents=True, exist_ok=True)

H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=26, spaceAfter=10)
H2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=14, leading=19, spaceAfter=8)
BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=11, leading=17, spaceAfter=9)
NOTE = ParagraphStyle("note", fontName="Helvetica-Oblique", fontSize=9, leading=13, textColor=colors.grey)
FICTION = "Northstar Business Services is a fictional company. This document is sample content."


def pdf(filename, title, pages):
    """pages: list of (heading, [paragraph | ('table', rows)])"""
    story = [Paragraph(title, H1), Paragraph(FICTION, NOTE), Spacer(1, 8 * mm)]
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

    def footer(canvas, doc):
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(20 * mm, 12 * mm, f"{title} | Page {doc.page}")

    SimpleDocTemplate(str(OUT / filename), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=22 * mm, bottomMargin=22 * mm, title=title,
                      author="Northstar Business Services (fictional)").build(story, onFirstPage=footer, onLaterPages=footer)


pdf("customer-support-handbook.pdf", "Customer Support Handbook", [
    ("1. Purpose of this handbook", [
        "This handbook describes how the Northstar support team works with customers. It applies to every support agent, team lead and duty manager.",
        "Northstar provides bookkeeping, payroll and back-office services to small businesses. Most customer questions are about invoices, reports, payroll runs and changes to a service plan.",
        "When this handbook and a customer contract disagree, the contract takes priority. Raise the conflict with your team lead."]),
    ("2. Support hours and channels", [
        "The support desk is open Sunday to Thursday, 08:00 to 18:00, and Friday, 08:00 to 13:00. Outside these hours an on-call duty manager handles Priority 1 tickets only.",
        "Customers can reach support by email, through the customer portal, or by phone. Every contact, including a phone call, is recorded as a ticket in the help desk before work starts.",
        "Chat is offered to customers on the Growth plan and above."]),
    ("3. Opening a ticket", [
        "Each ticket has one owner. The agent who opens the ticket owns it until it is resolved or handed over in writing.",
        "A ticket must contain the customer name, the affected service, a description in the customer's own words, and the priority.",
        "Do not ask customers to send passwords, full card numbers or bank login details. If a customer sends them, delete the message and tell the customer to change the credential."]),
    ("4. Priorities", [
        "Priority 1: the customer cannot run payroll, cannot issue invoices, or has a filing deadline within 24 hours that is at risk.",
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
        "Priority 1 tickets receive a first response within 30 minutes during business hours, and a status update every hour until the issue is resolved.",
        "Priority 2 tickets receive a first response within 4 business hours. Priority 3 tickets receive a first response within 1 business day.",
        "A first response is a message from a person that says who owns the ticket and what happens next. An automatic acknowledgement does not count."]),
    ("8. Escalation", [
        "Escalation exists so that no urgent ticket depends on a single person.",
        "If a Priority 1 ticket is still open after 2 hours, the agent escalates it to the duty manager and records the escalation in the ticket.",
        "The duty manager decides whether to bring in the account owner. A Priority 2 ticket that is open for more than 3 business days is escalated to the team lead.",
        "Escalating a ticket does not transfer ownership. The agent stays the customer's point of contact."]),
    ("9. Handing over a ticket", [
        "Hand over a ticket only at the end of a shift or before planned leave. Write a handover note with the current status, what was promised to the customer and by when.",
        "The receiving agent confirms the handover in the ticket. Until then the original agent remains the owner."]),
    ("10. Complaints", [
        "A complaint is any message in which a customer says they are unhappy with Northstar, whatever the channel.",
        "Acknowledge a complaint within 1 business day. The team lead reviews every complaint and replies in full within 5 business days.",
        "Complaints are logged in the complaints register, separately from the ticket."]),
    ("11. Refund approvals", [
        "Refund requests are checked against the Refund and Cancellation Policy before any amount is promised.",
        "Support agents may approve refunds of up to $400 on their own. Larger refunds need approval from a team lead before the customer is told.",
        "Refunds above $2,000 also need approval from the finance manager.",
        "Every approved refund is logged with the ticket number."]),
    ("12. Closing a ticket", [
        "Close a ticket when the customer confirms the issue is resolved, or 5 business days after the last message if the customer does not reply.",
        "Before closing, write a one-line summary of the cause and the fix. These summaries are reviewed every month to find repeated problems."]),
])

pdf("refund-and-cancellation-policy.pdf", "Refund and Cancellation Policy", [
    ("1. Scope", [
        "This policy explains when Northstar refunds a payment and how a customer can cancel a service plan. It applies to all bookkeeping and payroll plans.",
        "One-off projects, such as a historical clean-up of accounts, are covered by the project agreement and not by this policy."]),
    ("2. Monthly plans", [
        "Monthly plans can be cancelled at any time. The current month is not refunded.",
        "Cancellation takes effect at the end of the billing month in which the request is received. The customer keeps access to reports until that date."]),
    ("3. Annual plans", [
        "Annual plans are paid in advance for 12 months.",
        "Annual plans can be refunded in full within 30 days of purchase. After 30 days, the unused months are refunded pro rata, less a 10% early-cancellation fee.",
        "Refunds are returned to the original payment method within 7 business days.",
        "A month that has already started counts as used."]),
    ("4. How to cancel and exceptions", [
        "A cancellation request must come from a named contact on the account, in writing, by email or through the customer portal.",
        "Northstar waives the early-cancellation fee when a customer cancels because Northstar missed a filing deadline that was Northstar's responsibility.",
        "Setup fees are not refundable once onboarding has started."]),
])

pdf("product-and-service-catalog.pdf", "Product and Service Catalog", [
    ("1. About this catalog", [
        "This catalog lists the service plans Northstar offers to small businesses, with what each plan includes and its monthly price in US dollars.",
        "Prices are for businesses with one legal entity. Groups with several entities receive a written quote."]),
    ("2. How plans are billed", [
        "Plans are billed monthly in advance, or annually in advance with two months free.",
        "Transaction limits are counted per calendar month. A transaction is one bank line, invoice or receipt."]),
    ("3. Payroll Basic", [
        "Payroll Basic covers monthly payroll for up to 10 employees, payslips, and the monthly filing to the tax authority, for $180 a month.",
        "Each additional employee costs $12 a month."]),
    ("4. Bookkeeping Essentials", [
        "Our entry plan, for businesses that need their books kept in order each month.",
        "Bookkeeping Essentials covers up to 150 transactions a month, monthly bank reconciliation and a quarterly financial summary, for $290 a month.",
        "Additional transactions are billed in blocks of 50, at $40 per block.",
        "Support is by email, with replies within 1 business day."]),
    ("5. Bookkeeping Growth", [
        "For businesses that want a closer view of their numbers.",
        "Bookkeeping Growth covers up to 600 transactions a month, adds a named accountant and monthly management reports, and costs $640 a month.",
        "Payroll can be added to either bookkeeping plan.",
        "Growth customers can also reach support by chat."]),
    ("6. Plan comparison", [
        ("table", [
            ["", "Payroll Basic", "Bookkeeping Essentials", "Bookkeeping Growth"],
            ["Monthly price", "$180", "$290", "$640"],
            ["Included volume", "10 employees", "150 transactions", "600 transactions"],
            ["Reports", "Payslips", "Quarterly summary", "Monthly management reports"],
            ["Named accountant", "No", "No", "Yes"],
        ]),
        "A customer can move to a higher plan at any time. The change applies from the next billing month."]),
])


def docx(filename, title, sections, rtl=False):
    document = Document()
    def add(text, style=None):
        paragraph = document.add_heading(text, level=style) if isinstance(style, int) else document.add_paragraph(text)
        if rtl:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        return paragraph
    add(title, 0)
    add("נורת'סטאר שירותים עסקיים היא חברה בדיונית. המסמך הזה הוא תוכן לדוגמה." if rtl else FICTION)
    for heading, level, paragraphs in sections:
        add(heading, level)
        for paragraph in paragraphs:
            add(paragraph)
    document.save(str(OUT / filename))


docx("employee-onboarding-guide.docx", "Employee Onboarding Guide", [
    ("1. Before you start", 1, []),
    ("1.1 What we send you", 2, [
        "One week before your start date you receive a welcome email with your start time, the name of your onboarding buddy, and the forms you need to complete.",
        "If you have not received the email three working days before you start, write to People Operations."]),
    ("1.2 What to bring", 2, [
        "Bring an official photo ID and your bank account details on your first day. You do not need to bring a laptop."]),
    ("2. Your first week", 1, []),
    ("2.1 Your first day", 2, [
        "People Operations will meet you at reception at 9:00.",
        "On day one you receive your laptop and access badge, and your onboarding buddy walks you through the tools your team uses.",
        "Lunch on the first day is with your team."]),
    ("2.2 Meeting your team", 2, [
        "During the first week you have a 30-minute introduction with each person on your team, and one with your manager to agree on goals for the first 90 days."]),
    ("2.3 Required training", 2, [
        "Two courses are required for every new employee, whatever the role.",
        "Complete the information security course by the end of day three. Access to client systems is granted only after the course is passed.",
        "The second course, on client confidentiality, is due within 30 days."]),
    ("2.4 Payroll and paperwork", 2, [
        "The forms you need are in your welcome email.",
        "Submit your payroll and tax forms to People Operations by the end of your first week so that your first salary is paid on time.",
        "Salaries are paid on the 9th of each month. Questions about forms go to the People Operations desk."]),
    ("3. After the first week", 1, []),
    ("3.1 Probation", 2, [
        "The probation period is 90 days. Your manager holds a review with you after 45 days and again at the end of probation."]),
    ("3.2 Time off", 2, [
        "You accrue 1.5 vacation days for each month worked. Vacation requests are made in the HR system at least 14 days in advance."]),
])

docx("remote-work-policy-he.docx", "נוהל עבודה מרחוק", [
    ("1. מטרת הנוהל", 1, [
        "הנוהל מגדיר מתי ואיך עובדי נורת'סטאר רשאים לעבוד מחוץ למשרד. הוא חל על כל העובדים במשרה מלאה ובמשרה חלקית."]),
    ("2. ימי עבודה מהבית", 1, [
        "עובדים רשאים לעבוד מהבית עד שלושה ימים בשבוע, בתיאום מראש עם המנהל הישיר.",
        "ימי שלישי הם ימי משרד לכל הצוותים, ואין לעבוד בהם מרחוק ללא אישור מיוחד."]),
    ("3. זמינות", 1, [
        "בימי עבודה מרחוק יש להיות זמינים בין השעות 9:00 ל-16:00 בטלפון ובצ'אט הארגוני.",
        "פגישות עם לקוחות מתקיימות בווידאו עם מצלמה פתוחה."]),
    ("4. ציוד ואבטחת מידע", 1, [
        "העבודה מרחוק מתבצעת רק במחשב הנייד של החברה ודרך חיבור VPN.",
        "אין לשמור קובצי לקוחות על מחשב פרטי או להדפיס אותם בבית.",
        "אובדן או גניבה של מחשב יש לדווח לצוות אבטחת המידע בתוך שעה."]),
    ("5. החזר הוצאות", 1, [
        "החברה משתתפת בהוצאות אינטרנט ביתי בסך 100 ש\"ח בחודש לעובדים שעובדים מהבית יומיים בשבוע לפחות.",
        "בקשות להחזר מוגשות במערכת השכר עד ה-25 בכל חודש."]),
], rtl=True)

(OUT / "holiday-schedule-2027.txt").write_text(
    "Northstar Business Services - Office Holiday Schedule 2027\n"
    "(Northstar Business Services is a fictional company. This file is sample content.)\n\n"
    "The office is closed on the dates below. Support for Priority 1 tickets continues through the on-call duty manager.\n\n"
    "Spring closure: 21 April to 28 April 2027.\n"
    "Summer closure: 15 August 2027, one day.\n"
    "Autumn closure: 1 October to 3 October 2027, and 15 October to 22 October 2027.\n\n"
    "Payroll runs that fall inside a closure are processed on the last working day before it.\n"
    "Customers are told about each closure by email two weeks in advance.\n", encoding="utf-8")

print("built:", ", ".join(sorted(p.name for p in OUT.iterdir())))
