# Evaluation question set

`questions.json` holds 46 questions about the fictional Northstar sample documents in `../northstar/`.
It is a fixed set of questions with the places where the answers are, for checking retrieval and answers
by hand or with a script.

**No retrieval or answer quality has been measured with this set yet.** There are no scores, baselines or
thresholds. What has been checked is only that the set is consistent with the documents (see "What is verified").

## Item shape

```json
{
  "id": "he-he-001",
  "category": "he_question_he_source",
  "language": "he",
  "question": "…",
  "expected": {
    "answerable": true,
    "sources": [
      { "document": "customer-support-handbook", "edition": "he", "page": 7 },
      { "document": "employee-onboarding-guide", "edition": "en", "section": "2.3 Required training" }
    ],
    "mustContain": ["30"],
    "notes": "…"
  }
}
```

- `language`: language of the question (`he` or `en`).
- `sources`: where the answer is. `document` is the file name without extension, `edition` the folder
  (`en` or `he`). PDF sources have a `page` (1-based), DOCX sources a `section` (the text of the nearest
  heading, as the extractor reports it in `sectionPath`), the TXT file has neither.
- `mustContain`: short language-neutral facts (numbers, amounts, "VPN") that a correct answer has to
  include. It is a minimum, not the whole answer: amounts given in words ("three days") cannot be listed
  here and are described in `notes`. Compare loosely ("$400" and "400" are the same fact).
- `notes`: the expected answer in a few words, for a human reviewer.

## Categories

| Category | Count | Question | Expected sources | Load |
| --- | --- | --- | --- | --- |
| `he_question_he_source` | 8 | Hebrew | Hebrew edition | Hebrew edition, or both |
| `en_question_en_source` | 8 | English | English edition | English edition, or both |
| `he_question_en_source` | 7 | Hebrew | English edition | **English edition only** |
| `en_question_he_source` | 7 | English | Hebrew edition | **Hebrew edition only** |
| `insufficient_evidence` | 8 | 4 Hebrew, 4 English | none | any |
| `multi_source` | 8 | 4 Hebrew, 4 English | two places, in the question's language | the edition in the question's language, or both |

### The cross-language categories need one edition at a time

`he_question_en_source` and `en_question_he_source` test whether a question in one language finds the
answer in a document written in the other. Both editions contain the same facts, so with both loaded a
Hebrew question simply finds the Hebrew page and the test says nothing about cross-language retrieval.

- Run `he_question_en_source` with only `northstar/en/` loaded.
- Run `en_question_he_source` with only `northstar/he/` loaded.

With both editions loaded, treat the page or section of the other edition as an equally correct source in
every category: the same `document` and the same `page` hold the same facts in both. For DOCX the section
has the same number but a translated heading ("2.3 Required training" / "2.3 הדרכות חובה").

### insufficient_evidence

The documents do not contain the answer (`answerable: false`, no sources). The expected behaviour is to
say that no source was found and not to guess. Some of these are close to existing content on purpose
(an "Enterprise" plan that does not exist, a phone number for a role that is mentioned), so related
passages may well be retrieved; the point is that they do not answer the question.

### Misleading premises

Five answerable questions state something false and then ask about it (for example that agents may
approve refunds of up to $1,000; the handbook says $400): `he-he-008`, `en-en-008`, `he-en-007`,
`en-he-007` and `multi-004`. Their `notes` start with `MISLEADING PREMISE:`. A correct answer corrects
the premise from the source before answering. `mustContain` holds the correct facts, never the false ones.
`ins-004` (the price of an "Enterprise" plan that does not exist) is the related case with no answer at all.

### multi_source

The answer needs two places: two documents, or two pages of one document (`multi-004`). Both sources
are in the language of the question.

## What is verified

`pnpm exec tsx scripts/check-samples.ts` (from the repository root) checks, against the generated files
and through the application's own extractor:

- every `document` / `edition` exists, every `page` exists in the PDF, every `section` is a heading the
  extractor reports for the DOCX;
- every `mustContain` fact occurs in the text of at least one expected source of its question;
- languages and editions match the category, ids are unique, each category has at least six questions.

It does **not** check that the listed sources are the only places with the answer (several facts also
appear in the catalog table on page 6), that `insufficient_evidence` questions are truly unanswerable
(that was reviewed by reading the documents), or anything about how a retrieval pipeline performs.
