/**
 * Turn raw LLM tokens into clean, speakable sentences.
 * Sentence granularity gives the TTS natural prosody and lets us drop a dangling
 * half-sentence when the model hits max_tokens.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/(\d)\s*°\s*[FfCc]?\b/g, "$1 degrees"],
  [/°\s*[FfCc]?\b/g, " degrees"],
  [/(\d)\s?F\b/g, "$1 degrees"],
  [/\bmph\b/gi, "miles per hour"],
  [/\bNDVI\b/g, "vegetation health index"],
  [/\bNDWI\b/g, "water index"],
  [/\bET[o0]?\b/g, "evapotranspiration"],
  [/\bGDDs?\b/g, "growing degree days"],
  [/\bREI\b/g, "restricted entry interval"],
  [/\bPHI\b/g, "pre-harvest interval"],
  [/\bIPM\b/g, "I P M"],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const BRACKETS = /\[[^\]]{0,200}\]/g;
const SPECIAL = /<\|[^|>]*\|>/g;
const MARKUP = /[*#`~]|^_+|_+$/g;
const LIST_MARKER = /^\s*(?:[-•–—]|\d{1,2}[.)])\s+/;
const SENT_END = /([.!?]+["')\]]*)(\s+)/g;

export function cleanForSpeech(text: string): string {
  let t = text.replace(SPECIAL, "").replace(BRACKETS, "").replace(EMOJI, "").replace(MARKUP, "").replace(LIST_MARKER, "");
  for (const [re, rep] of REPLACEMENTS) t = t.replace(re, rep);
  t = t.replace(/([a-z]{3,})(\d)/g, "$1 $2"); // the fast model sometimes glues words to digits ("next7 days")
  return t.replace(/\s+/g, " ").trim();
}

export class SentenceStreamer {
  private buf = "";
  emitted = 0;
  tokens = 0;
  constructor(private firstFlushChars = 80) {}

  private pop(end: number): string | null {
    const raw = this.buf.slice(0, end);
    this.buf = this.buf.slice(end);
    const out = cleanForSpeech(raw);
    if (!out) return null;
    this.emitted++;
    return out + " ";
  }

  /** Don't cut inside an unclosed [bracket] or <|special|> token. */
  private safeLimit(): number {
    for (const [open, close] of [["[", "]"], ["<|", "|>"]] as const) {
      const i = this.buf.lastIndexOf(open);
      if (i !== -1 && !this.buf.slice(i).includes(close)) {
        if (this.buf.length - i > 200) {
          this.buf = this.buf.slice(0, i) + this.buf.slice(i + open.length);
          return this.buf.length;
        }
        return i;
      }
    }
    return this.buf.length;
  }

  feed(token: string): string[] {
    this.tokens++;
    this.buf += token;
    const out: string[] = [];
    for (;;) {
      const limit = this.safeLimit();
      const window = this.buf.slice(0, limit);
      let cut: number | null = null;
      const nl = window.indexOf("\n");
      if (nl >= 3) cut = nl + 1;
      SENT_END.lastIndex = 0;
      for (let m; (m = SENT_END.exec(window)); ) {
        const head = window.slice(0, m.index + m[1].length).trim();
        if (head.length >= 4 && !/^\d{1,2}[.)]$/.test(head)) {
          const end = m.index + m[0].length;
          cut = cut === null ? end : Math.min(cut, end);
          break;
        }
      }
      if (cut === null && this.emitted === 0 && window.length >= this.firstFlushChars) {
        const c = Math.max(window.lastIndexOf(", ", window.length - 2), window.lastIndexOf("; ", window.length - 2));
        if (c >= 30) cut = c + 2;
      }
      if (cut === null) break;
      const piece = this.pop(cut);
      if (piece) out.push(piece);
    }
    return out;
  }

  finish(truncated: boolean): string[] {
    let rest = cleanForSpeech(this.buf);
    this.buf = "";
    if (!rest) return [];
    if (!/[.!?]$/.test(rest)) {
      if (truncated && this.emitted > 0) return []; // drop a sentence cut off by max_tokens
      rest += ".";
    }
    this.emitted++;
    return [rest + " "];
  }
}
