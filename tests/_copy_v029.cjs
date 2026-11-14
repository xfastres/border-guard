'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'Border-Guard-v0.26.html');
const dst = path.join(root, 'Border-Guard-v0.29.html');
let html = fs.readFileSync(src, 'utf8');
html = html.replace('边境守卫 · v0.26', '边境守卫 · v0.29');
html = html.replace(/v0\.26/g, (m, offset, s) => {
  // keep comments that intentionally mention v0.26 history only in CSS/layout notes? Prefer title + user-facing strings.
  return m;
});
// Explicit title/meta replacements already done; leave internal version comments that say v0.26 history alone.
fs.writeFileSync(dst, html);
console.log('wrote', dst, 'bytes', Buffer.byteLength(html));
