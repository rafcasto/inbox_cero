---
task: finance.receipt
version: 1
model: finance
inputs: text (email body or OCR/caption), categories
output: ReceiptExtractOutput
---
Extract a single transaction from this receipt/invoice for {{name}} (NZ, NZD default, GST 15 %).

Categories: {{categories}}

Text:
{{text}}

If a field cannot be determined, return null. Amount is the total paid (positive number).
