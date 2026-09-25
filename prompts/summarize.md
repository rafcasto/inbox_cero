---
task: summaries
version: 1
model: summaries
inputs: text
output: { summary }
---
Summarise for {{name}} in ≤ 40 words, plain, factual. Return JSON { "summary": string }.

{{text}}
