// Parses JSON with comments and trailing commas, like opencode.jsonc and bossman.jsonc.

// The index of the next character that isn't space or part of a comment.
function nextSignificant(text: string, i: number): number {
  while (i < text.length) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
    else if (c === "/" && text[i + 1] === "/") while (i < text.length && text[i] !== "\n") i++;
    else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else return i;
  }
  return i;
}

export function parseJsonc(text: string): unknown {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      // Copy a string as is, so "https://…" keeps its slashes.
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      i = nextSignificant(text, i);
    } else if (c === ",") {
      const n = nextSignificant(text, i + 1);
      if (text[n] !== "}" && text[n] !== "]") out += c; // drop a trailing comma
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out);
}
