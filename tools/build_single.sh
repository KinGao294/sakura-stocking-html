#!/usr/bin/env bash
# Builds stocking-play.html: index.html with src/main.js (+ vendored three) bundled, minified and inlined.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
npx -y esbuild@0.24.0 src/main.js --bundle --format=iife --minify --legal-comments=none --outfile=build/bundle.js
python3 - <<'PY'
src = open('index.html', encoding='utf-8').read()
tag = '<script type="module" src="./src/main.js"></script>'
assert tag in src, 'module script tag not found in index.html'
js = open('build/bundle.js', encoding='utf-8').read().replace('</script', '<\\/script')
out = src.replace(tag, '<script>\n' + js + '\n</script>')
open('stocking-play.html', 'w', encoding='utf-8').write(out)
print('wrote stocking-play.html', len(out.encode()) // 1024, 'KiB')
PY
