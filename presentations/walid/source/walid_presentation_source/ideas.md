# Design Directions

## Approach 1

**Theme Name:** Architect’s Sample Room  
**Very Brief Intro:** A warm, editorial architectural presentation inspired by material libraries, drawing tables, and premium contractor proposal books. It combines bone-white paper surfaces, charcoal linework, cedar accents, and oversized technical typography.  
**Probability:** 0.021

## Approach 2

**Theme Name:** Night Shift Control Deck  
**Very Brief Intro:** A dark industrial review interface with illuminated drawing overlays, dense project telemetry, and a high-contrast construction-site atmosphere.  
**Probability:** 0.064

## Approach 3

**Theme Name:** Field Binder 2.0  
**Very Brief Intro:** A pragmatic digital field-book aesthetic using tabbed sections, stamped approvals, checklists, and rugged document textures designed for quick site use.  
**Probability:** 0.008

# Chosen Direction: Architect’s Sample Room

## Design Movement

**Contemporary editorial modernism informed by architectural competition boards and high-end material libraries.** The page should feel like a curated client presentation laid across a designer’s worktable rather than a generic software dashboard.

## Core Principles

1. **Evidence before decoration:** Every visual flourish must reinforce dimensions, material intent, pricing, scope, or client decision-making.
2. **Layered physicality:** Use paper surfaces, drawing grids, thin rules, clipped image masks, and material swatches to suggest plans and samples without imitating a literal scrapbook.
3. **Asymmetric editorial rhythm:** Alternate large image fields, narrow technical columns, offset captions, and full-width document bands. Avoid repeated centered cards.
4. **Warm industrial restraint:** Charcoal, bone, concrete grey, and cedar create a premium contractor identity without luxury clichés.

## Color Philosophy

The primary canvas is **warm drawing-paper bone**, chosen to reduce visual fatigue and make technical linework feel familiar. **Deep charcoal** anchors headings and navigation like powder-coated metal. **Burnished cedar** is the ownable accent because it directly links the interface to the façade concept and BH Contracting’s finish expertise. Concrete grey supports measurements and utility information; a muted safety-gold is reserved for cautions and pending decisions.

## Layout Paradigm

Use a **long-form architectural review strip** rather than a centered grid. The hero is split diagonally between a large model rendering and a narrow project brief. Major sections behave like drawing sheets pinned in sequence: design concepts use horizontally scrollable full-bleed plates; measurements use an offset elevation board; the model occupies a dark recessed bay; contract content unfolds as a dense readable document with a persistent summary rail. Section labels sit in the outer margin as drawing indexes.

## Signature Elements

1. **Cedar datum bars:** Thin horizontal cedar rules that mark section transitions and mimic façade accent bands.
2. **Drawing-coordinate labels:** Small uppercase references such as `A-EX-01`, `MODEL 01`, and `CONTRACT 03` positioned like architectural sheet metadata.
3. **Material chips:** Physical-looking rectangular swatches with profile direction and finish names, never generic circular color dots.

## Interaction Philosophy

Interactions should feel like inspecting a proposal set. Concept selectors slide a single large presentation plate into view; hotspots reveal concise rationale; measurement rows highlight the matching elevation; contract headings open without hiding the overall document structure. Controls use firm 140–220 ms transitions and small positional shifts rather than bouncy effects.

## Animation

Use a 220 ms custom ease-out for panel changes and a 160 ms active press scale of 0.97. On first entry, the hero rendering and project metadata reveal with a 50 ms stagger and no scale-from-zero. Section content uses subtle 12 px upward translation with opacity. The cedar datum line draws horizontally once per section. The interactive 3D model itself remains directly manipulable without ornamental animation. Respect `prefers-reduced-motion` and remove non-essential transitions when requested.

## Typography System

Use **Bodoni Moda** for rare editorial display moments and **Archivo** for all technical, interface, contract, and body content. Headlines use condensed-feeling Archivo Black or 800 weights with tight tracking; drawing labels use Archivo 600 uppercase with generous letter spacing; body copy uses Archivo 400 at generous line height. Measurements use tabular numerals and bold weight. Do not use Inter.

## Brand Essence

**BH Contracting turns complex exterior scope into a clear, buildable client decision.**  
Personality: **precise, grounded, resourceful.**

## Brand Voice

Headlines are declarative and concrete. Calls to action name the exact review action. Microcopy is concise, calm, and candid about assumptions.

Example headline: **“One shell. Three distinct exterior directions.”**  
Example CTA: **“Compare the façade systems.”**

## Wordmark & Logo

Use a custom **BH monogram constructed from two interlocking bent-metal profiles**: the left stroke resembles vertical siding, while the right stroke forms a folded flashing return. Pair it with a bespoke uppercase `BH CONTRACTING` wordmark using modified Archivo letterforms, not a default font treatment.

## Signature Brand Color

**Burnished Cedar — `#A96F3F`**. It is specific to the project’s material language, warm enough to humanize technical information, and distinct against both bone and charcoal surfaces.

## Style Decisions

- Keep the page primarily light and tactile, with dark recessed bays only for the model and contract-control sections.
- Present technical content as authoritative but label all unverified grade, flashing, product, and contract assumptions clearly.
- Use the same signature cedar datum across the hero, concept plates, plan board, model viewer, takeoff, and contract summary.
- The hero reads as a warm architectural proposal sheet first, with charcoal limited to rendering frames, technical labels, and recessed controls.
- The custom BH folded-profile monogram remains large enough in the header and primary brand moment for its interlocking geometry to be clearly visible.
- Narrative and decision sections use layered bone-paper surfaces, coordinate labels, material chips, and cedar datums; full dark fields are reserved for model manipulation and contract control.
