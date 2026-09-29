# Clipboard probe results

Protocol: [PROTOCOL.md](PROTOCOL.md). Status: **not yet run**.

| | |
|---|---|
| Date | |
| Figma version (Help → About) | |
| Figma app | desktop / browser |
| Chromium browser and version | |
| Safari version | |

## T0: node copy pasted as properties

| Action | Result |
|---|---|
| ⌘C on A, ⌘⌥V on B | |

## Captures

| ID | Action | Change counter moved? | Figma payload found? | `dataType` | Notes |
|---|---|---|---|---|---|
| C1 | ⌘⌥C on A | | | | |
| C2 | Fill row selected, ⌘C | | | | |
| C3 | ⌘C on A | | | | |

Differences between C1 and C3 (message keys, content-node fields):

-

## Authored payloads, Chromium

For P rows, state what happened to each property of B:
*unchanged*, *replaced*, or *reset*.

### Synthetic source

| ID | Write path | Envelope | Pasted? | Fill | Stroke | Radius | Effects | Opacity | Size / position |
|---|---|---|---|---|---|---|---|---|---|
| N1 | clipboard.write | figma-exact | | n/a | n/a | n/a | n/a | n/a | n/a |
| P1 effects | | | | | | | | | |
| P2 fillPaints | | | | | | | | | |
| P3 cornerRadius | | | | | | | | | |
| P4 empty | | | | | | | | | |
| P5 dense | | | | | | | | | |

### Captured template (C1)

| ID | Write path | Envelope | Pasted? | Fill | Stroke | Radius | Effects | Opacity | Size / position |
|---|---|---|---|---|---|---|---|---|---|
| R1 replay | | | | | | | | | |
| R2 re-encode | | | | | | | | | |
| P1 effects | | | | | | | | | |
| P2 fillPaints | | | | | | | | | |
| P3 cornerRadius | | | | | | | | | |
| P4 empty | | | | | | | | | |
| P5 dense | | | | | | | | | |

## Authored payloads, Safari

| ID | Write path | Envelope | Pasted? | Notes |
|---|---|---|---|---|
| N1 | clipboard.write | | | |
| N1 | copy event | | | |
| R1 | clipboard.write | | | |
| R1 | copy event | | | |

## Conclusions

| Question | Answer |
|---|---|
| Does ⌘⌥C use the system clipboard? | |
| Is the properties payload a `fig-kiwi` scene payload? | |
| Are sparse payloads respected, per field? | |
| Which write path does the extension use? | |
| Which envelope variant? | |
| Chosen design for M5 | |
