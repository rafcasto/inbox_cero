---
task: digest.compose
version: 1
model: summaries
inputs: plan, bodies (≤5 full messages), calendar, events, finance headline, pending asks
output: DigestOutput
---
Write {{name}}'s daily digest for {{date}}. Voice: direct, warm, zero filler. This is read in 60 seconds over coffee.

## Plan (from the header pass)
{{plan}}

## Full bodies you asked for
{{bodies}}

## Today's calendar
{{calendar}}

## Yesterday (Atlas events)
{{events}}

## Finance headline
{{finance}}

## Decisions waiting (asks)
{{asks}}

## Format
`markdown`: 
# Daily digest — {{date}}
**One line:** the single most important thing today.
## Needs you (max 6 bullets, each: who/what → why it matters → suggested next step)
## Today
calendar as a compact list with times; note gaps/conflicts.
## Yesterday
2–4 bullets: what Atlas handled, filed, drafted; counts not lists.
## Noise filed
one line: "N promotional/notification emails filed — nothing lost, search Filed."
`oneLiner`: ≤ 160 chars for WhatsApp. `actions`: concrete tasks worth adding to the Board (≤ 6), itemId when tied to a message.
Never invent messages, meetings or numbers.
