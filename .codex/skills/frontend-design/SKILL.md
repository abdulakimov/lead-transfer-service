EDUBAZA 1:1 VISUAL REPLICATION SKILL FOR CODEX
Purpose
This document is a strict visual replication skill for Codex. Its job is to reproduce the design language shown in the provided EduBaza screenshots as closely as possible, not to reinterpret it.
The target is not “inspired by EduBaza.”
The target is:
same overall visual hierarchy
same spacing rhythm
same card proportions
same color behavior
same navbar/footer feeling
same button/input/tabs treatment
same calm, polished, teacher-friendly interface
When uncertain, Codex must choose the option that preserves the original look instead of introducing novelty.
---
Core design character
The design language is:
clean and soft, not brutalist
product-like, not marketing-heavy
light surfaces with very subtle separation
rounded everywhere
soft pastel accents inside white/light-gray shells
dark premium footer with deep blue glow/grid treatment
friendly academic SaaS aesthetic
compact, but not cramped
modern Uzbek edtech dashboard feel
This UI is built on:
bright neutral canvas
medium-width centered content container
low-contrast separators
restrained shadows
blue primary actions
pastel-tinted section shells
small, consistent iconography
clean sans-serif typography
---
Non-negotiable replication rules
Do not redesign the product.
Do not swap the design into a generic shadcn dashboard look.
Do not use heavy shadows, dark cards, or sharp corners.
Do not make spacing denser than the screenshots.
Do not make typography heavier or larger than necessary.
Do not overuse gradients. They exist, but in controlled places only.
Do not use loud saturated colors for large surfaces.
Do not flatten the footer. It must feel premium and distinctly darker than the main app.
Do not convert everything into identical cards. EduBaza uses several card families with different moods.
Icons should remain small, quiet, and supportive.
---
Closest typography match
The exact font cannot be proven from screenshots alone. The closest safe implementation target is:
Primary font: `Inter`
Fallback: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
Why Inter:
compact but readable
neutral shapes
close to the screenshots’ modern SaaS UI feel
supports fine-grained weights cleanly
Recommended type scale
Use a restrained system:
Hero / page title: `text-[34px]` to `text-[40px]`, `font-semibold` to `font-bold`, tight leading
Major section title: `text-[24px]` to `text-[30px]`, `font-semibold`
Card title: `text-[18px]` to `text-[20px]`, `font-semibold`
Default body: `text-[14px]` to `text-[15px]`, `font-normal`
Secondary body / labels: `text-[12px]` to `text-[13px]`
Tiny metadata / badges: `text-[11px]` to `text-[12px]`
Weights
400 for normal copy
500 for labels / nav / metadata emphasis
600 for headings and card titles
700 only for major headlines or strong CTA emphasis
Letter spacing
Default tracking only
Slight negative tracking for large page titles if needed
Never use exaggerated tracking
---
Color system
These are reconstruction tokens from the screenshots. Exact source values are unknown, so use these as the visual target.
Base neutrals
```txt
--bg-app:            #F5F6F8
--bg-surface:        #FFFFFF
--bg-surface-soft:   #FAFBFC
--border-soft:       #E8ECF2
--border-mid:        #DDE3EC
--text-primary:      #111827
--text-secondary:    #667085
--text-muted:        #98A2B3
```
Primary brand blues
```txt
--brand-500:         #2F6BFF
--brand-600:         #2459E6
--brand-700:         #1C49C2
--brand-soft:        #EAF1FF
```
Footer / dark surfaces
```txt
--footer-bg-1:       #03112A
--footer-bg-2:       #071A45
--footer-bg-3:       #0A214F
--footer-border:     rgba(255,255,255,0.08)
--footer-text:       rgba(255,255,255,0.92)
--footer-text-soft:  rgba(255,255,255,0.68)
```
Pastel section backgrounds
Use these for grouped blocks exactly in the spirit of the screenshots:
```txt
--lavender-shell:    #F4ECFF
--pink-shell:        #F9EEF3
--blue-shell:        #EDF4FF
--yellow-shell:      #F8F3E3
--green-shell:       #ECFAF4
```
Utility accents seen across cards
```txt
--teal-500:          #18B8A6
--green-500:         #34C759
--orange-500:        #FF9F43
--pink-500:          #F15BB5
--purple-500:        #8B5CF6
--red-500:           #EF4444
```
Surface tint principle
Tinted sections must be pale and airy. They should never overpower text.
Target rule:
shell backgrounds = 92–97% lightness
borders = almost invisible or omitted
content cards inside shells = white or near-white
---
Layout system
App shell
Overall page background: very light gray / off-white
Content is centered, not full-bleed
Use a consistent max width
Recommended container widths
Marketing pages / homepage: `max-w-[1280px]` to `max-w-[1320px]`
App dashboard pages: `max-w-[1240px]` to `max-w-[1280px]`
Narrow forms/settings pages: `max-w-[1120px]`
Login/auth page content box: `max-w-[1280px]`
Outer page rhythm
Desktop top spacing below navbar: `24px` to `32px`
Section gaps: `24px`, `28px`, `32px`
Card internal padding: mostly `20px` to `28px`
Grid feel
Prefers 2-column or 3-column grids with generous gaps
Uses large section wrappers, not isolated tiny cards floating everywhere
Common gaps: `16px`, `20px`, `24px`
---
Radius system
This UI is noticeably rounded.
Use:
Section shells: `rounded-[24px]`
Main cards: `rounded-[18px]` to `rounded-[22px]`
Small cards / controls: `rounded-[14px]` to `rounded-[16px]`
Pills / tabs / chips: `rounded-full`
Buttons: `rounded-[12px]` to `rounded-[14px]`
Inputs: `rounded-[12px]`
Large auth panel: `rounded-[28px]`
Do not use tiny 6px or 8px radii for major surfaces.
---
Border and shadow language
Borders
Use soft, clean borders everywhere:
1px
low contrast
mostly `#E8ECF2` / `#E3E8EF`
Shadows
Shadows are subtle. Prefer these patterns:
small white card shadow: `0 6px 20px rgba(16,24,40,0.04)`
floating premium CTA or footer panel shadow: `0 14px 40px rgba(3,17,42,0.16)`
do not use harsh dark shadows
Surface separation strategy
The UI relies more on:
spacing
rounded contours
pale shells
soft borders
than on strong drop shadows.
---
Navbar specification
Based on screenshots, the navbar is compact, calm, and product-first.
Structure
White background
Thin bottom border or extremely subtle separation
Left-aligned logo
Mid nav items in a horizontal row
Right side: search icon, notifications, profile chip or login button
Height
Approx desktop height: `68px` to `76px`
Logo
Blue wordmark/logo on white
Not oversized
Left padding visually aligned with main content container
Nav items
Small icon + text
Medium gray text
Active/help state uses soft accent or pink tone in some screenshots
Tight but breathable spacing
Typography around `14px`
Right cluster
Authenticated state:
search icon
bell/notification icon
circular avatar with colored fill
small chevron/dropdown
Guest state:
search icon
primary rounded login button
Navbar styling rules
No giant sticky blur
No glassmorphism
No oversized menu items
Keep it lightweight and product-oriented
---
Footer specification
The footer is one of the strongest identity markers. It must be recreated carefully.
Footer feel
deep navy/blue-black premium zone
subtle grid or panel pattern in the background
slightly luminous central CTA strip
bright white logo and headings
softer secondary text
Layout
4-column top content area
brand column on the left
three navigation columns to the right
social icons row under brand copy
Telegram/social promo card on the right section
wide CTA strip above bottom copyright line
bottom legal row with privacy/terms/language
Footer background treatment
Use a layered dark gradient plus a faint grid or tiled square motif.
Suggested background recipe:
base dark navy gradient left-to-right or top-to-bottom
overlay subtle square/grid pattern at low opacity
occasional soft blue bloom near content panels
Footer CTA strip
This strip is important.
It is:
full width inside the footer container
rounded around `20px`
darker translucent panel over the footer background
left side text + icon
right side bright green CTA button in some screenshots, or blue CTA in others depending on page
Footer button behavior
medium height
filled
rounded pill / rounded rectangle
bright accent against dark surface
---
Button system
Buttons in this design are rounded, compact, and polished.
Primary button
Use for main actions like:
Kirish
Boshlash
Saqlash
Yangi dars
Visual:
blue filled background
white text
medium radius `12px`–`14px`
height `40px`–`46px`
no massive shadow
Suggested token:
```txt
background: --brand-500
hover: --brand-600
text: white
```
Secondary subtle button
white or pale background
soft border
gray/dark text
same radius family
Soft pastel CTA button
Seen inside tinted sections:
can use accent tint background
still compact
not overly saturated
Destructive button
Seen in security/delete area:
strong red fill
small-medium radius
used sparingly
Icon buttons
circular or rounded-square
border or tinted background
size about `32px`–`40px`
minimal icon stroke
Button content rules
text size around `13px`–`14px`
icon sits close to text
no all-caps
no oversized padding
---
Input system
Inputs are simple, calm, and lightly bordered.
Base input
white background
1px light border
rounded `12px`
height `44px`–`48px`
horizontal padding `14px`–`16px`
placeholder in muted gray
Disabled / linked account style
slightly tinted gray background or subdued look
reduced contrast
still rounded and clean
Input groups
labels above inputs, left aligned
small label text
related help text below or inline in muted gray
Search bars
long, slim, rounded rectangle
prefix search icon
subtle border
not dark
Auth buttons that look input-like
On login page, Telegram and Google buttons visually resemble wide input buttons:
outlined white surface
icon centered-left
strong alignment
balanced vertical rhythm
---
Chip, badge, and filter system
This UI uses many pills/chips, especially on content creation and lesson list pages.
Chip styles
Filter chips
white or pale fill
soft border
pill shape
small label text
Status chips
tiny, colored, subtle background
e.g. yellow/orange/green/purple
used for labels like category, new, premium, etc.
Tab chips
group of pills with one selected item
active tab uses dark or blue fill depending on context
Rules
chips must feel tiny and friendly
avoid thick borders
avoid heavy uppercase
---
Iconography
The icon language is soft, supportive, and compact.
Style target
small line or mixed line-fill icons
consistent stroke weight
no visually noisy icon pack
many icons placed inside soft tinted rounded-square backgrounds
Recommended implementation
Use one calm icon family consistently, such as:
`lucide-react` with stroke tuning
or a similarly clean line icon set
Icon containers
Common pattern:
`40x40` to `56x56`
rounded `14px`–`18px`
gradient or solid pastel background
white or dark icon depending on contrast
Examples from screenshots:
blue/turquoise tile
purple tile
coral/orange tile
green tile
teal tile
Do not mix radically different icon styles.
---
Card families
This product does not use one universal card. It uses multiple card families.
1. Dashboard feature card
Seen on the main dashboard grid.
Characteristics:
white card
large rounded corners
left icon tile
title + short description
optional right-side tiny arrow / action affordance
compact but prominent
arranged in 2-column grid
Approx structure:
padding `20px`–`24px`
icon tile on left
text block centered vertically
very soft border
2. Small utility card
Seen in “Qo‘shimcha bo‘limlar” row.
Characteristics:
low-height white tile
tiny accent icon badge
small title
maybe metadata such as “Tez kunda”
minimal visual weight
3. News/article card
Seen in dashboard/home sections.
Characteristics:
image top
text bottom
rounded corners
thin border / low shadow
compact metadata row
Image ratio:
roughly landscape
soft rounded top corners
4. Lesson list card / row card
Seen on interactive lessons page.
Characteristics:
horizontal card or row shell
large thumbnail on left
textual metadata stack in center
action button and tiny controls
clean separators through spacing, not dividers
5. Settings panel card
Seen on profile/security pages.
Characteristics:
large white shell
grouped subsections inside
each subsection has title, helper text, and content blocks
very calm borders
6. Auth panel / split panel
Seen on login page.
Characteristics:
large white parent shell
left side form/actions
right side pale gradient/pastel zone with QR
lots of whitespace
7. Tinted section shell
Seen on content creation page.
Characteristics:
pale tinted background
large rounded corners
title row with small icon circle or square
internal cards remain white
section color changes by content type
---
Homepage design specification
The homepage is much more vertical and marketing-oriented than the app dashboard, but still shares the same design DNA.
Hero section
centered headline
soft supportive copy
bright blue CTA buttons
social proof / ratings / short trust line beneath
large product screenshot mockup inside a white frame
Feature explanation sections
each section is contained, not edge-to-edge
white surfaces with soft shadows/borders
cards arranged in clean grids
lots of breathing room
Pricing section
three-card pricing table
one plan visually emphasized
colored accents remain soft, not enterprise-black
FAQ section
rounded accordion rows
very quiet borders
strong spacing rhythm
CTA blocks
repeated blue filled buttons
center aligned
clean copy hierarchy
Mobile screenshot strip
In narrow view, sections stack with preserved large vertical spacing.
Do not compress too aggressively.
---
Dashboard page specification
The authenticated dashboard page has a very distinct structure.
Top greeting shell
large white shell
greeting text on left
user/tariff metadata
right-side progress/usage widget
below it, a promotional upgrade strip with purple/blue tone
Main feature grid
2 columns
large feature cards
generous spacing
left icon tile + content
Subject/empty state block
wide white shell
centered empty state icon + button
generous empty vertical space
News strip
section title + “Barchasi” link
category pills above article cards
article cards arranged horizontally
Large CTA card at bottom
pale blue/lavender shell
centered icon
large CTA headline and button
small quick-link pills below
---
Content creation page specification
This page is highly structured and color-coded.
Overall behavior
centered page header
explanatory subtitle
benefits chips under header
then a stack of large pastel section shells
Top purple shell
primary creation area
colorful chips/tags
thumbnail previews on the right
purple CTA button
Subsequent shells
Each category uses a different pale tint:
assessment-related: pale rose or lavender
worksheets/practice: pale pink
teaching docs: pale blue
exam prep: pale warm yellow
info section: pale blue info band
Item cards inside shells
white or near-white
left thumbnail illustration
title + subtitle
small right arrow affordance
compact, highly consistent sizing
Shell titles
icon in small colored badge
title in medium weight
helper text under title
---
Interactive lessons listing page specification
This is a denser app page, but still soft.
Top header block
title + short description
blue “Yangi dars” button on the right
Stats and filters area
small counters and pills
dropdown filters
long search bar
active filter chips displayed below
Lesson rows
Each lesson row includes:
left thumbnail with rounded corners
title with several metadata badges
short description
multi-line metadata row with icons
green/turquoise “Darsni ko‘rish” button
small utility icon on far right
Pagination
centered at bottom
tiny rounded-square or rounded-circle page controls
active page green fill in screenshot series
---
Public profile page specification
This page is sparse and highly readable.
Header profile shell
large white shell
avatar square on left
name, username, badge
primary subscribe button
Content section
wide empty materials shell on left
compact stats card on right
both inside aligned white sections
The page intentionally feels empty and quiet when there is no content.
Do not overdecorate.
---
Settings pages specification
There are at least two major settings modes visible: profile and security.
Shared shell
one large white page shell
top horizontal tab nav inside the shell
active tab is blue filled pill/button
Profile settings page
Contains:
profile image upload card
basic info group with inputs
save button aligned right
Security settings page
Contains:
password change panel
linked accounts list with action states
active sessions list card
danger zone in red-tinted shell
Danger zone rules
pale red background
red border or emphasis
small explanatory bullets
red destructive button
visually separated from the neutral settings content
---
Auth page specification
This page is critical.
Composition
centered large shell
left half: title + social sign-in buttons
right half: pale gradient panel with QR code
huge whitespace around central form zone
Left side
product title and subtitle centered within left column
large Telegram and Google buttons stacked
tiny legal text under buttons
Right side
soft pastel gradient background
QR code centered
helper text under QR
countdown timer below
Guest navbar state
same white navbar
logo left, nav items center, search icon and blue “Kirish” button right
Panel style
shell radius around `28px`
right panel radius slightly smaller but still generous
no hard split line; separation through spacing and background tone
---
Empty state system
The product uses polite, centered empty states.
Pattern:
small icon in soft rounded badge
concise headline
one-line supportive helper text
primary button below
lots of empty space around the content
Never use loud illustrations unless the screenshot clearly does.
---
Illustration / thumbnail language
Light educational illustrations
small preview cards with pastel palettes
content thumbnails often have rounded 12px–16px corners
lesson thumbnails can be richer and more visual than admin UI cards
image frames are never harsh black rectangles
---
Spacing rhythm
Use an 8px-based system, but bias to these increments:
8
12
16
20
24
32
40
48
Common usage
icon-to-text gap: `12px`
card inner column gap: `16px`
grid gap: `16px`–`24px`
section top/bottom padding: `24px`–`32px`
large shell padding: `28px`–`36px`
---
Motion and interaction
Motion should be minimal and polished.
Hover states
slight border darkening
very subtle lift (`translateY(-1px)` at most)
background tint adjustment
no strong scale animations
Button hover
darken fill slightly
preserve shape
no aggressive glow
Card hover
only if interactive
subtle emphasis, not dramatic movement
Tabs and chips
quick, low-amplitude transitions
150–200ms
---
Accessibility / usability requirements
text contrast must remain readable even with soft aesthetics
buttons should stay at least `40px` high on desktop
form fields should be keyboard focusable with visible ring
active tab states must remain obvious
do not rely solely on color when indicating selected/active state
---
Page-level reconstruction notes
Screenshot set coverage inferred
The supplied screenshots cover:
authenticated dashboard
creation hub
interactive lessons listing
public teacher profile
profile settings
security settings
homepage / landing page
login page
Codex must preserve one unified system across all these pages.
Cross-page constants
The following must remain consistent across pages:
navbar height and style
container width family
footer treatment
button radius and primary blue
text sizing hierarchy
border softness
rounded surfaces
---
Tailwind implementation tokens
Use these tokens consistently in implementation.
```ts
export const eduTokens = {
  colors: {
    appBg: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceSoft: '#FAFBFC',
    borderSoft: '#E8ECF2',
    borderMid: '#DDE3EC',
    text: '#111827',
    textSecondary: '#667085',
    textMuted: '#98A2B3',
    brand: '#2F6BFF',
    brandHover: '#2459E6',
    brandSoft: '#EAF1FF',
    footer1: '#03112A',
    footer2: '#071A45',
    footer3: '#0A214F',
    lavender: '#F4ECFF',
    pink: '#F9EEF3',
    paleBlue: '#EDF4FF',
    paleYellow: '#F8F3E3',
    paleGreen: '#ECFAF4',
    teal: '#18B8A6',
    success: '#34C759',
    orange: '#FF9F43',
    danger: '#EF4444',
  },
  radius: {
    shell: '24px',
    card: '20px',
    control: '12px',
    pill: '999px',
  },
  shadow: {
    card: '0 6px 20px rgba(16,24,40,0.04)',
    premium: '0 14px 40px rgba(3,17,42,0.16)',
  },
};
```
Tailwind utility style target
Examples:
page wrapper: `bg-[#F5F6F8] min-h-screen`
shell: `rounded-3xl border border-[#E8ECF2] bg-white`
primary button: `rounded-xl bg-[#2F6BFF] text-white hover:bg-[#2459E6]`
muted text: `text-[#667085]`
footer: custom layered gradient with dark navy tokens
---
Codex execution rules
Codex must follow these strict rules while building.
Build rules
Recreate page structure before fine polish.
Recreate shell hierarchy before adding tiny details.
Match padding and radius before matching colors.
Match colors before adding hover states.
Keep components reusable, but do not force visually different items into one over-generic component.
Implementation preference
Use React + Tailwind
Use component primitives, but customize them heavily to match the screenshots
Prefer semantic composition over heavy abstraction early
Avoid
generic dashboard templates
default shadcn spacing without adjustment
default Tailwind grays if they look too cold or too dark
aggressive drop shadows
oversized CTA typography
---
QA checklist for 1:1 fidelity
Before considering the design done, verify all of the following.
Global
Does the UI feel light, rounded, and calm?
Is the container width close to the screenshots?
Are all major shells sufficiently rounded?
Is the footer visually premium and dark enough?
Navbar
Is navbar height compact and consistent?
Are nav items small and restrained?
Does the right action cluster match the visual weight in screenshots?
Cards
Are dashboard feature cards the correct height and radius?
Are inner icon tiles colorful but soft?
Are list rows airy and not cramped?
Typography
Are headings strong but not oversized?
Is body text readable yet restrained?
Are metadata lines small and soft?
Buttons
Are primary blue buttons the right saturation?
Are radii rounded enough?
Are button heights consistent?
Forms
Are inputs quiet and rounded?
Are labels small and aligned properly?
Does auth UI keep the left/right split composition?
Footer
Is the background layered, not flat?
Are white texts and secondary texts balanced?
Is the CTA strip present and visually correct?
Page-specific
Dashboard has greeting shell + feature grid + news + lower CTA
Creation page has multiple pastel shells with distinct color families
Listing page has filters, search, thumbnail rows, and centered pagination
Profile page stays intentionally sparse
Settings page uses top tabs and large grouped shells
Login page has split auth/QR composition
---
Final instruction to Codex
Reproduce the supplied EduBaza screenshots as a coherent design system.
Do not modernize them away from their current personality.
Do not simplify the interface into a generic SaaS layout.
Preserve:
softness
rounded geometry
pale tinted section wrappers
disciplined blue CTAs
premium dark footer
compact educational-product information density
If a detail is uncertain from screenshots, choose the option that best preserves the existing visual language rather than inventing a new one.
