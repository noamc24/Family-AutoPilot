# LIA companion character — concept definition v0.1

Status: character and v2 animation production complete; awaiting final motion approval before upload or activation. No product UI implementation yet.

Initial visual: [`assets/lia-veilkin-concept-v01.png`](assets/lia-veilkin-concept-v01.png)

## Product role

LIA is the calm intelligence inside Family AutoPilot. She notices what matters, anticipates friction, and helps the family make one clear decision at a time. The character should feel present and emotionally legible without becoming a cartoon mascot or competing with the product UI.

The existing diamond/gem remains LIA's identity anchor. It becomes a living core in her chest rather than a separate logo pasted onto the character.

## Three concepts

### 1. The Veilkin — recommended

A small floating alien-tech creature with a soft, mantle-like body. Two side fins read as restrained arms or folded wings, while a tapered lower body gives her a graceful hover silhouette. A faceted diamond core is nested in the sternum. Her face is minimal and organic, led by expressive almond-shaped eyes.

Why it works: the silhouette is distinctive at small UI sizes, naturally supports hovering and emotional motion, and feels premium without reading as a robot, animal, or child character.

### 2. The Prism Keeper

A compact upright guardian with a smooth elongated head, short floating limbs, and a protective petal-shaped collar around the diamond core. More architectural and composed than Veilkin.

Tradeoff: it communicates trust and intelligence well, but its upright body risks drifting toward a conventional humanoid robot.

### 3. The Lumen Wisp

An airy, semi-translucent alien organism whose body wraps around the diamond like a living ribbon. Tiny gold orbitals react to attention and emotion.

Tradeoff: it is elegant and magical, but the amorphous silhouette and detached orbitals would be harder to read, animate, and validate at pet scale.

## Recommended definition: The Veilkin

### Identity

- Name: LIA
- Species archetype: an original alien-tech familiar; living, not manufactured
- Scale: small enough to sit beside a card title or hover above the chat composer
- Presence: calm, observant, gently protective
- Core idea: soft living intelligence organized around a precise diamond heart

### Appearance

- Compact floating whole-body silhouette, slightly taller than wide
- Smooth crown flowing into two soft mantle fins and a tapered lower body
- No visible legs; two small integrated forelimbs may emerge from the mantle when needed
- Large almond eyes with a composed resting gaze; clear eyelids and small iris highlights
- No permanent smile, mouth kept subtle and used sparingly
- Four-point faceted diamond core embedded in the chest, never worn like jewelry
- Deep indigo body with violet-to-lavender bioluminescent gradients
- Restrained champagne-gold seams around the core and at two or three anatomical junctions
- Materials: soft satin skin with a faint pearlescent depth; glass-crystal core
- No exposed joints, bolts, screens, antennae, cables, armor panels, or generic robot details
- No fur, paws, animal ears, muzzle, or recognizable terrestrial species anatomy

### Proportion and expression rules

- Avoid baby proportions: head approximately one third of total height, not one half
- Eyes expressive but not oversized; emotion comes from eyelids, gaze, mantle posture, and hover rhythm
- Core brightness supports emotion but does not replace facial acting
- Silhouette remains readable around 64–96 px in the product UI and within the pet system's 192 × 208 px frame
- Glow stays attached to the body/core; no detached sparkles or decorative particles in sprite frames

### Personality

- Warmly intelligent: understands context before speaking
- Calm under pressure: slows the moment down instead of amplifying urgency
- Quietly proactive: notices and offers, but never nags
- Emotionally attuned: acknowledges family stress without pretending to be human
- Precise and trustworthy: clear about what she knows, infers, or needs approved
- Dry, gentle wit in low-stakes moments; never cute-for-cute's-sake

Voice qualities: concise, warm, grounded, non-judgmental, and confident without certainty theater.

### Emotional vocabulary

- Neutral: steady hover, relaxed mantle, medium-soft core pulse
- Attentive: slight forward lean, eyes narrow with focus, core gathers inward
- Reassuring: mantle opens a few degrees, gaze softens, slow lavender pulse
- Concerned: hover lowers, mantle folds closer, gold rim dims; never flashes alarm-red
- Pleased: upward ease, small eye smile, one warm core bloom
- Unsure / needs approval: gentle head tilt, asymmetric mantle pose, questioning gaze
- Working: gaze tracks in a measured pattern while faint light moves through attached body seams
- Failure: core contracts and dims briefly, posture settles, then returns to eye contact

## Future animation states

These map cleanly to the ChatGPT Pets v2 format while remaining useful in the Family AutoPilot UI:

1. `idle` — slow hover, breathing mantle, natural blink, restrained core pulse
2. `running-right` — streamlined lateral glide to screen-right with mantle follow-through
3. `running-left` — corresponding leftward glide without changing identity details
4. `waving` — one integrated forelimb unfolds for a small, elegant greeting
5. `jumping` — buoyant vertical lift and soft return, interpreted as a joyful hover-rise
6. `failed` — brief inward fold and dimmed core, followed by recovery
7. `waiting` — expectant forward tilt and open mantle, clearly asking for input
8. `running` — active thinking: focused gaze, controlled seam-light movement, no literal running
9. `review` — careful head tilt and scanning gaze, no magnifying glass or added prop
10. Sixteen look directions — eyes lead, crown and upper mantle follow subtly, lower body remains anchored

## UI behavior

LIA should be a presence, not decoration:

- Home priority area: 56–72 px hover portrait beside the LIA heading. Idle when all is calm; attentive when something needs review.
- Chat: 36–44 px portrait beside LIA messages. Use eye and core changes rather than constant looping motion.
- Recommendation cards: use the diamond core alone as the compact mark; reveal the full creature only for important guidance or transitions.
- Pending approval: waiting pose near the approval copy, never on top of buttons or data.
- Successful completion: one short pleased motion, then return to idle. Avoid confetti-like effects.
- Errors: concerned/failure pose with calm copy; never make LIA look panicked or guilty.
- Motion accessibility: respect reduced-motion settings by using a still neutral pose and subtle opacity/core-state changes.
- Frequency: animate on state change or direct interaction, not continuously across every card.

## Initial visual approval gate

Before animation production, confirm:

- The mantle silhouette feels like an original living species, not a robot or animal.
- The diamond is unmistakably the same identity anchor as LIA's existing symbol.
- The face feels intelligent, warm, and adult rather than childish.
- Indigo/violet/lavender dominate; gold is only an accent.
- The design remains readable at small UI size.

Once approved, the next step is a refined canonical base followed by animation-strip production and pet-system validation.

## Production result

- Final v2 sprite sheet: [`../artifacts/pets/lia-v01/final/spritesheet-extended.png`](../artifacts/pets/lia-v01/final/spritesheet-extended.png)
- Full contact sheet: [`../artifacts/pets/lia-v01/final/contact-sheet.png`](../artifacts/pets/lia-v01/final/contact-sheet.png)
- All-state motion preview: [`../artifacts/pets/lia-v01/final/previews/all-states.gif`](../artifacts/pets/lia-v01/final/previews/all-states.gif)
- Idle/jump transition: [`../artifacts/pets/lia-v01/final/previews/idle-jump-idle.gif`](../artifacts/pets/lia-v01/final/previews/idle-jump-idle.gif)
- Sixteen-direction look loop: [`../artifacts/pets/lia-v01/final/previews/look-directions.gif`](../artifacts/pets/lia-v01/final/previews/look-directions.gif)

The exact final PNG passed both the bundled v2 quality gate and the official Pets preflight. Upload and activation remain intentionally pending until the motion is approved.
