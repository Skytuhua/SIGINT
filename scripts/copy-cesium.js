// scripts/copy-cesium.js
// Copies Cesium static assets to public/cesium/ so they're served correctly.
// Runs automatically via "postinstall" in package.json.
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../node_modules/cesium/Build/CesiumUnminified');
const dest = path.resolve(__dirname, '../public/cesium');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const entries = fs.readdirSync(from, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

const folders = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];
for (const folder of folders) {
  const fromPath = path.join(src, folder);
  const toPath = path.join(dest, folder);
  if (!fs.existsSync(fromPath)) {
    console.warn(`Source not found: ${fromPath} — skipping`);
    continue;
  }
  console.log(`Copying ${folder}...`);
  copyDir(fromPath, toPath);
}
console.log('Cesium assets copied to public/cesium/');
