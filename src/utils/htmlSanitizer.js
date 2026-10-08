import sanitizeHtml from "sanitize-html";

/**
 * Sanitiser for builder-authored rich text (Terms & Conditions).
 *
 * The text is typed into a rich-text editor by one tenant and then rendered on
 * a PUBLIC, unauthenticated page and inside customer-facing PDFs — so it is
 * untrusted output no matter how trusted the author is. The allow-list below is
 * everything the editor's toolbar can produce and nothing else: no <script>, no
 * <iframe>, no event handlers, no inline styles, no data:/javascript: URLs.
 *
 * Anything outside the list is dropped tag-wise (its text survives), which is
 * the right default for prose: a pasted <div> becomes its words rather than
 * vanishing silently.
 */
const RICH_TEXT_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "sub", "sup",
    "ul", "ol", "li", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    // Quill writes indent levels as ql-indent-N classes; keeping the class
    // attribute (values filtered below) preserves nested list indentation.
    "*": ["class"],
  },
  allowedClasses: {
    "*": [/^ql-(indent-\d|align-(center|right|justify))$/],
  },
  // No protocol-relative URLs: they inherit the page's scheme and are a common
  // way to smuggle an off-site link past a naive allow-list.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  // Every outbound link opens in a new tab and cannot reach back through
  // window.opener.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
  // Drop the contents too — a stripped <style> block would otherwise dump raw
  // CSS into the page as visible text.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

/**
 * @param {unknown} html
 * @param {number} [maxLength] hard cap applied AFTER sanitising, so a caller
 *   can bound how much a single field can grow the PDF/page.
 * @returns {string} sanitised HTML, or "" for anything that is not a string.
 */
export function sanitizeRichText(html, maxLength = 20000) {
  if (typeof html !== "string" || !html.trim()) return "";
  const clean = sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

/**
 * The entities sanitize-html emits when it strips markup. They have to come
 * back out: the result of sanitizePlainText is consumed as TEXT (React text
 * nodes, `esc()` in the PDF template), so leaving them encoded makes a title
 * like "Terms & Conditions" print literally as "Terms &amp; Conditions".
 *
 * Decoding cannot reintroduce markup — every consumer escapes on output, so a
 * decoded "<" is rendered as the character "<", never as a tag.
 */
const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Strip a value down to plain text — used for fields the fixed format renders
 * as headings (clause titles, document title), where markup would break the
 * layout the format guarantees.
 */
export function sanitizePlainText(value, maxLength = 255) {
  if (typeof value !== "string" || !value.trim()) return "";
  const clean = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    // &amp; must be decoded LAST or "&amp;lt;" would round-trip into "<".
    .replace(/&(?:lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

/**
 * True when rich text carries no visible content — "<p><br></p>" is what an
 * emptied Quill editor submits, and it must not count as a written clause.
 */
export function isRichTextEmpty(html) {
  if (typeof html !== "string") return true;
  return !sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .trim();
}

export default { sanitizeRichText, sanitizePlainText, isRichTextEmpty };
