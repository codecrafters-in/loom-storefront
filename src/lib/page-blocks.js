/**
 * A store page's blocks (`GET /pages/:slug`) as what each one shows. Pure, so the rules are tested without a browser;
 * src/pages/StaticPage.jsx draws the parts.
 */

/** Blank-line separated paragraphs of a block's plain text. */
export const paragraphs = (text) => (typeof text === 'string' ? text : '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

/** Consecutive question-and-answer blocks read as one list. */
export function groupBlocks(blocks = []) {
  const out = []
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block) continue
    const last = out[out.length - 1]
    if (block.type === 'faq' && last?.type === 'faq-group') last.items.push(block)
    else if (block.type === 'faq') out.push({ type: 'faq-group', items: [block] })
    else out.push(block)
  }
  return out
}

/**
 * The parts of one block, in the order they are drawn: `heading`, `image`, `text`, `table`, then `contact` or `form`.
 *
 * Any block keeps the image and the table it was sent with, a question's answer included (a size table under "How do
 * the trousers fit?"). A contact form's text introduces the form, so it sits above it; with `features.contactForm`
 * off the block shows nothing, rather than a "Send us a message" heading over an empty space.
 */
export function blockParts(block, features = {}) {
  if (!block) return []
  if (block.type === 'contact-form' && features?.contactForm === false) return []
  return [
    block.h && 'heading',
    block.image?.url && 'image',
    (paragraphs(block.p).length > 0 || Boolean(block.html)) && 'text',
    Array.isArray(block.table) && block.table.length > 0 && 'table',
    block.type === 'contact' && 'contact',
    block.type === 'contact-form' && 'form',
  ].filter(Boolean)
}
