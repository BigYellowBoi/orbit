#!/bin/sh
# Builds two targets from src/:
#   dist/artifact.html  claude.ai artifact (the artifact host adds the document skeleton and window.claude)
#   index.html          GitHub Pages: full document, home-screen icons, GitHub sync (src/gh.js)
set -e
cd "$(dirname "$0")/.."
JS="src/core.js src/engine.js src/imports.js src/charts.js src/explorer.js src/notes.js src/views.js src/boot.js"
mkdir -p dist
{ cat src/head.html; cat src/body.html; echo '<script>'; cat $JS; echo '</script>'; } > dist/artifact.html
{ cat src/gh-head.html; cat src/head.html; echo '</head>'; echo '<body>'; echo '<div class="sbar" aria-hidden="true"></div>'; cat src/body.html; echo '<script>'; cat $JS src/gh.js; echo '</script>'; echo '</body>'; echo '</html>'; } > index.html
for f in dist/artifact.html index.html; do
  node -e "const h=require('fs').readFileSync('$f','utf8');new Function(h.split('<script>')[1].split('</script>')[0]);console.log('$f ok',(h.length/1024).toFixed(1)+'KB')"
done
