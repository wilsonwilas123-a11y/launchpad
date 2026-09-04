/**
 * Prompts for the local model.
 *
 * Two shapes: one for generating a website specification, one for editing an
 * existing specification from a natural-language command. Both ask for a
 * deliberately small JSON vocabulary — a 8B–14B local model follows a short
 * enumerated schema far better than a sprawling one, and the service merges the
 * answer over a deterministically compiled base spec, so a partially valid
 * reply still produces a complete site.
 */

const SECTION_SCHEMA = `
hero        {eyebrow, headline, subheadline, primary{label,action}, secondary{label,action}, layout:"centered"|"split"|"fullbleed", badges:[string]}
about       {heading, body, bullets:[string], stats:[{value,label}]}
features    {heading, sub, items:[{title, body, icon}]}
productShowcase {heading, sub, products:[{name, price, unit, blurb, tag, cta}]}
gallery     {heading, sub}
video       {heading, body, caption}
pricing     {heading, sub, plans:[{name, price, unit, blurb, features:[string], featured(bool), cta}], note}
testimonials{heading, items:[{quote, name, role}]}
countdown   {heading, note, targetIso(YYYY-MM-DD), display:"slabs"|"stack"}
waitlist    {heading, body, placeholder, ctaLabel, incentives:[string], privacy}
newsletter  {heading, body, ctaLabel, cadence}
contact     {heading, body, note, fields:[{label,type}], channels:[{label,value}]}
faq         {heading, items:[{question, answer}]}
social      {heading, links:[{platform, handle, url}]}
cta         {heading, body, primary{label,action}, secondary{label,action}, note}
footer      {tagline, columns:[{title, links:[string]}], legal}
logos       {heading, items:[{name}]}
stats       {heading, items:[{value, label, note}]}
eventDetails{heading, items:[{label, value}], note}
speakers    {heading, sub, items:[{name, role, topic}]}
schedule    {heading, sub, days:[{label, slots:[{time, title, who}]}]}
tickets     {heading, tiers:[{name, price, unit, perks:[string], status, cta}], note}
menu        {heading, groups:[{title, items:[{name, desc, price}]}], note}
team        {heading, sub, items:[{name, role, bio}]}
problem     {heading, body, points:[string]}
solution    {heading, body, points:[string]}
album       {heading, blurb, meta:[{label, value}], formats:[string]}
tracklist   {heading, items:[{n, title, duration, note}], note}
artistStory {heading, paragraphs:[string], quote}
preSave     {heading, body, platforms:[{name, label, url}], dateLabel, ctaLabel}`.trim();

function specInstruction() {
  return `You are Launchpad's website architect. Return ONE JSON object describing a website. Nothing else.

Shape:
{
  "name": string,
  "tagline": string,
  "theme": {
    "mode": "dark" | "light",
    "colors": { "background": "#hex", "text": "#hex", "accent": "#hex" },
    "typography": { "headingFont": "display"|"serif"|"sans"|"grotesk"|"mono"|"condensed", "bodyFont": "sans"|"serif"|"mono", "scale": 1.0-1.35, "headingWeight": 400-900 },
    "radius": 0-24,
    "spacing": "tight"|"airy"|"roomy",
    "visualStyle": string,
    "effects": [string]        // any of: grain, glow, grid, rules, marquee, letterbox, vignette, mono-labels, soft-shadow
  },
  "nav": { "cta": { "label": string, "action": "#anchor" }, "links": [{ "label": string, "action": "#anchor" }] },
  "sections": [ { "type": <one of the section types below>, "content": { ... } } ]
}

Section types and their content objects (omit fields you cannot fill, never invent extra fields):
${SECTION_SCHEMA}

Hard rules:
- 6 to 11 sections, in a deliberate order. Do not use the same structure as a template.
- Copy must sound like a human wrote it for this exact brand: specific, concrete, no adjectives stacked three deep, no exclamation marks, no "in today's fast-paced world".
- Every string under 160 characters. Prices in the currency the user implied.
- Only use section types listed above. Only use the JSON field names shown.
- Output must be valid JSON: double quotes, no trailing commas, no comments, no markdown fences.`;
}

function buildSpecPrompt({ masterPrompt, websiteType, platform, assets, design, details }) {
  const assetLines = (assets || []).length
    ? (assets || [])
        .slice(0, 12)
        .map((a) => `- ${a.filename}${a.assetCategory ? ` (${a.assetCategory})` : ''}${a.description ? `: ${a.description}` : ''}${a.selectedSection ? ` → pinned to ${a.selectedSection}` : ''}`)
        .join('\n')
    : '- none uploaded yet (use no images, rely on typography and layout)';

  return `${specInstruction()}

Website type: ${websiteType}
Platform target: ${platform && platform.label ? platform.label : 'Mobile + Laptop'} (${platform && platform.mode ? platform.mode : 'both'})
${design && design.name ? `Design direction: ${design.name}${design.styleTags ? ` — ${design.styleTags.join(', ')}` : ''}` : 'Design direction: choose one yourself from the description.'}

Master prompt from the user:
${masterPrompt}

Assets the user uploaded (mention them in the right sections; do not invent URLs):
${assetLines}

Now return the JSON object only.`;
}

const EDIT_SCHEMA = `ops vocabulary (each op is an object with "op" plus its fields):
{"op":"addSection","type":"<section type>","after"?: "<section type>","before"?: "<section type>","content"?: { … }}
{"op":"removeSection","type":"<section type>"}
{"op":"showSection","type":"<section type>"}
{"op":"moveSection","type":"<section type>","after"?: "<section type>","before"?: "<section type>"}
{"op":"setField","type":"<section type>","path":"content.headline"|"content.subheadline"|"content.body"|"content.heading"|"content.ctaLabel","value": string}
{"op":"updateSettings","type":"<section type>","settings": { "align"?: "left"|"center"|"right", "padding"?: "sm"|"md"|"lg"|"xl", "top"?: number, "bottom"?: number, "columns"?: number, "layout"?: string }}
{"op":"setTheme","path":"colors.accent"|"colors.background"|"colors.text"|"typography.headingFont"|"radius"|"spacing"|"mode"|"visualStyle","value": string|number}
{"op":"addThemeEffect","effect":"grain"|"glow"|"grid"|"rules"|"marquee"|"letterbox"|"vignette"|"mono-labels"|"soft-shadow"}
{"op":"removeThemeEffect","effect":"<same list>"}
{"op":"addProduct","name": string,"price"?: string,"blurb"?: string}
{"op":"addFaq","question": string,"answer": string}
{"op":"addTestimonial","quote": string,"name"?: string,"role"?: string}
{"op":"setPlatform","mode":"mobile"|"desktop"|"both"}
{"op":"setName","name": string}
{"op":"setCountdownTarget","targetIso":"YYYY-MM-DD"}`;

function buildEditPrompt({ command, spec }) {
  const summary = {
    name: spec.name,
    type: spec.websiteType,
    visualStyle: spec.theme && spec.theme.visualStyle,
    effects: spec.theme && spec.theme.effects,
    colors: spec.theme && { background: spec.theme.colors.background, text: spec.theme.colors.text, accent: spec.theme.colors.accent },
    sections: spec.sections.filter((s) => !s.hidden).map((s) => ({ type: s.type, heading: s.content && (s.content.headline || s.content.heading) })),
  };
  return `You edit website specifications. Reply with JSON only.

${EDIT_SCHEMA}

Return: {"ops":[ … ], "summary": string}
- "summary" is one short sentence (max 90 characters) telling the user what changed, in plain language.
- Make the smallest set of ops that satisfies the instruction. Never output an op you are unsure about.
- Use only section types that exist in the current site, except for addSection.

Current site:
${JSON.stringify(summary, null, 1)}

Instruction from the user: "${command}"`;
}

module.exports = { buildSpecPrompt, buildEditPrompt, specInstruction, SECTION_SCHEMA, EDIT_SCHEMA };
