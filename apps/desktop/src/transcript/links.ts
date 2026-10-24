// Links in an answer. The text is a model's, and the model has read files,
// tool output and pages an attacker can shape, so a link is treated as input.
//
// Only https links keep their target: those are the ones the app may open
// (the opener's permission is https://* and nothing else), and an http, mailto,
// tel, data:, javascript: or relative target would be a link that does nothing,
// or worse. The rest render as their text.
//
// Pi hides a link's URL in iTerm, which shows hyperlinks; the window shows it
// on hover instead. The one exception is a link whose text is itself a URL to
// a different host: there the text is a lure, and the real host is named.

/** react-markdown's urlTransform: an https URL as it is, any other target dropped. */
export function keepHttps(url: string): string | null {
  return /^https:\/\/[^/]/i.test(url) && hostOf(url) !== undefined ? url : null;
}

/** The target's host, when the link's text reads as a URL to another host; otherwise nothing. */
export function lureHost(text: string, href: string): string | undefined {
  const shown = text.trim();
  if (!URL_SHAPED.test(shown)) return undefined;
  const named = hostOf(/^https?:\/\//i.test(shown) ? shown : `https://${shown}`);
  const target = hostOf(href);
  if (named === undefined || target === undefined) return undefined;
  return bare(named) === bare(target) ? undefined : target;
}

/** A domain, with or without a scheme and a path: `example.test/docs`, `https://www.example.test`. */
const URL_SHAPED = /^(?:https?:\/\/)?(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#]\S*)?$/iu;

/** The host as the browser will reach it: lower case, an international name in its punycode form. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

function bare(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}
