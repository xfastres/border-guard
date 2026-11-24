'use strict';

const { statSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolveChromeBin() {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of candidates.filter(Boolean)) {
    const absolutePath = path.resolve(candidate);
    if (statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) return absolutePath;
  }
  throw new Error('Chrome, Chromium, or Edge executable not found. Set CHROME_BIN to its executable path.');
}

function toFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

module.exports = { resolveChromeBin, toFileUrl };
