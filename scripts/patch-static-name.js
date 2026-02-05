#!/usr/bin/env node
/**
 * Removes "static name = '...'" / "static name=\"...\"" from .js and .ts in node_modules.
 * These cause "Cannot assign to read only property 'name'" in strict mode (e.g. Next/browser).
 * Patches both source (errors.js/ts) and minified bundles (e.g. peer-id index.min.js).
 */
const fs = require('fs');
const path = require('path');

const nodeModules = path.join(__dirname, '..', 'node_modules');
// Single/double quote, optional semicolon, optional newline (minified has no newline)
const regex = /\s*static\s+name\s*=\s*['"][^'"]+['"];?\s*/g;

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') walkDir(full, callback);
      else if (!ent.name.startsWith('.') && ent.name !== 'test' && ent.name !== 'tests') walkDir(full, callback);
    } else if (ent.isFile() && (ent.name.endsWith('.js') || ent.name.endsWith('.ts'))) {
      callback(full);
    }
  }
}

let patched = 0;
const rel = (p) => path.relative(nodeModules, p);
walkDir(nodeModules, (filePath) => {
  const r = rel(filePath);
  const isLibp2p = r.startsWith('@libp2p' + path.sep) || r.includes(path.sep + '@libp2p' + path.sep);
  const isErrors = path.basename(filePath) === 'errors.js' || path.basename(filePath) === 'errors.ts';
  if (!isLibp2p && !isErrors) return;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  if (!content.includes('static name')) return;
  const newContent = content.replace(regex, '');
  if (newContent === content) return;
  fs.writeFileSync(filePath, newContent);
  patched++;
  console.log('Patched:', filePath.replace(nodeModules, 'node_modules'));
});

if (patched > 0) {
  console.log('Patched', patched, 'file(s) to fix static name read-only error.');
}
