# Apple Reminders ↔ Atlas (iPhone Shortcut, no Mac required)

Two-way sync via one Shortcut that runs automatically every 30 minutes (iOS 17+: Automations run without confirmation).

## One-time setup
1. Atlas → Settings → Integrations → Apple Reminders → **Generate token**. Copy it.
2. Shortcuts app → **+** → name it `Atlas Sync`. Build the actions below.
3. Shortcuts → Automation → **+** → *Time of Day* → repeat *Hourly*… (choose every 30 min is not offered; pick hourly, or create two automations at :00 and :30) → *Run Immediately* → select `Atlas Sync`.

## Shortcut actions
```
1  Text                  → <your token>                                   (call it TOKEN)
2  Text                  → https://<your-portal>/api/reminders/sync       (call it URL)
3  Find Reminders        → All Reminders, filter: Modified Date is in the last 2 days  (limit 200)
4  Repeat with each      → (Reminders)
5     Dictionary         → id: (Repeat Item › Identifier)  title: (Name)  notes: (Notes)
                            list: (List › Name)  dueDate: (Due Date, ISO 8601)  completed: (Is Completed)
                            modified: (Modification Date, ISO 8601)
6     Add to Variable    → reminders
7  End Repeat
8  Dictionary            → token: TOKEN, reminders: (reminders)
9  Get Contents of URL   → URL, Method POST, Request Body JSON = (Dictionary from 8)
10 Get Dictionary Value  → create  from (Contents of URL)
11 Repeat with each      → (create)
12    Add New Reminder   → Title: (Repeat Item › title), Notes: (Repeat Item › notes), Due: (Repeat Item › due), List: "Atlas"
13    Dictionary         → taskId: (Repeat Item › id), reminderId: (New Reminder › Identifier)
14    Add to Variable    → created
15 End Repeat
16 Get Dictionary Value  → complete  from (Contents of URL)
17 Repeat with each      → (complete)
18    Find Reminders     → Identifier is (Repeat Item), limit 1
19    Set Reminder Completed (Reminders › first)
20    Add to Variable    → completed
21 End Repeat
22 Dictionary            → token: TOKEN, created: (created), completed: (completed)
23 Get Contents of URL   → URL, Method PUT, Request Body JSON = (Dictionary from 22)
```

## Behaviour
- New reminders → Atlas Inbox items (triaged like email; `idea:` / `write about` → Content seeds).
- Completing a reminder on the phone → linked Atlas task moves to Done.
- Tasks with **Sync to Apple Reminders** ticked → a reminder in the "Atlas" list; completing the task in Atlas completes the reminder on the next run.
- Latency ≤ 30 min. Rotate the token in Settings at any time.
