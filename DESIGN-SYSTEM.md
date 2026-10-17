# Pixel Peeper design system (short version)

One page to keep every screen consistent. The long version, with the reasons, is in `DESIGN.md`.
Figma reference: file `1LeW6xrkcWExXaHIwbU4qf`, the three "Lesson window" frames.
Code: `apps/extension/components/tokens.css` (values) and `components/icons.ts` (icons).

## 1. Feel
Quiet, precise, friendly. The website being studied is the star; our UI floats on top and stays calm.
The only playful thing is the detective.

## 2. Type
| Use | Font | Weight | Sizes | Letter spacing |
|---|---|---|---|---|
| Headings, titles, buttons | Schibsted Grotesk | 600, 700 | 48 / 32 / 22 / 19 / 15 / 14 | -4% big, -2% medium, -1% small |
| Reading text, labels, tabs | Roboto | 400, 500, 600 | 17 / 14 / 13 / 12 | 0 (labels -1%) |
| Measured numbers, code | JetBrains Mono | 400, 700 | 12 / 11 | 0 |

Mono is only for real measured values or code. All three fonts are free (SIL OFL) and bundled.

## 3. Colour
| Name | Hex | Used for |
|---|---|---|
| Ink | `#1B1C1F` | Main text |
| Ink 2 | `#3C3F44` | Body text |
| Muted | `#6B6F76` | Labels, captions |
| Line | `#E6E7EA` | Hairlines |
| Canvas | `#F7F8F8` | Page background |
| Indigo | `#5E6AD2` | Actions, selection, focus |
| Green | `#17804A` on `#E6F5EC` | **Measured** only |
| Amber | `#9A5408` on `#FDF1E2` | **Inferred** only |
| Red | `#C0362C` on `#FDECEB` | Fails and errors |
| Yellow | `#F5C84C` | Detective's eyes only, never a button |

Rule: colour never works alone. Measured and Inferred always show the word too.

## 4. Gradients (always top to bottom, always soft)
- Window: `#FFFFFF → #FBFBFD`
- Card or chip: `#FFFFFF → #F8F9FA`
- Measured tag: `#F0FAF4 → #DFF2E6`, edge `#93C6AB`
- Inferred tag: `#FFF7EC → #FBE8CF`, edge `#D5B28B`
- Primary button: `#7884E6 → #5F6BD3 → #525DC6`, edge `#4A55BD`, white top highlight, soft indigo glow
- Every raised surface gets a 1px white line on its top edge (`inset 0 1px 0 rgb(255 255 255 / .7)`).

## 5. Shape and space
- Radius: 4 (tiny tags), 6 (tags, chips), 8 (buttons, icon tiles), 10 (segmented control), 12 (cards), 20 (windows).
- Corners: iOS smooth corners (Figma corner smoothing 100%, CSS `corner-shape`). Circles stay round.
- Spacing: 4, 8, 12, 16, 20, 24, 32. Window padding 16.

## 6. Pieces
- **Tag:** tint fill + tinted 1px edge, 6px radius, Roboto Medium 12, small icon.
- **Evidence chip:** white, hairline, green dot, label in Roboto, value in Mono Bold.
- **Icon tile:** 28px square, tinted gradient, Phosphor Duotone icon 16px.
- **Tabs:** segmented control; the white pill slides to the chosen tab.
- **Buttons:** one indigo primary per screen; the rest are quiet (text + icon).
- **Icons:** Phosphor Duotone only. No emoji or text symbols as icons.

## 7. Motion
- Ease-out `cubic-bezier(.23,1,.32,1)` for things appearing; under 300ms for interface parts.
- Buttons press to 97% size. Nothing grows from zero.
- A spring is allowed only for the detective and for the selection "lock".
- If the person turns on "reduce motion", movement stops but colours still change.

## 8. Sound
Small synthesised sounds, only after the person clicks something. One switch turns everything off.
The onboarding has a soft generated music loop.

## 9. Do and don't
- Do keep the website readable; our UI never covers what you picked.
- Do test every screen at 375px wide and on a dark website.
- Don't use yellow for buttons. Don't use amber for anything except Inferred.
- Don't put a card inside a card.
