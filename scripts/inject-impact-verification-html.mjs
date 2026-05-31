/**
 * Post-build: ensure Impact verification meta (with `value` attribute) is in
 * prerendered HTML files. Next.js metadata.other emits `content` only; Impact
 * and curl grep need the tag in raw static HTML before any client streaming.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ID = "9624ca76-4d4b-48b7-aa75-b993343f25db";
const META =
  `<meta name="impact-site-verification" value="${ID}" content="${ID}">`;
const APP_HTML_ROOT = join(process.cwd(), ".next", "server", "app");

function walkHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...walkHtmlFiles(path));
    } else if (entry.endsWith(".html")) {
      out.push(path);
    }
  }
  return out;
}

function injectMeta(html) {
  if (html.includes(`name="impact-site-verification"`) && html.includes(`value="${ID}"`)) {
    return html;
  }

  if (html.includes(`name="impact-site-verification"`)) {
    return html.replace(
      /<meta\s+name="impact-site-verification"[^>]*\/?>/i,
      META,
    );
  }

  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${META}`);
  }
  if (html.includes("<head ")) {
    return html.replace(/<head([^>]*)>/, `<head$1>${META}`);
  }

  return html;
}

let updated = 0;
try {
  const files = walkHtmlFiles(APP_HTML_ROOT);
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = injectMeta(before);
    if (after !== before) {
      writeFileSync(file, after, "utf8");
      updated += 1;
    }
  }
  console.log(
    `[inject-impact-verification] updated ${updated}/${files.length} prerendered HTML files`,
  );
} catch (e) {
  console.warn("[inject-impact-verification] skipped:", e.message);
}
