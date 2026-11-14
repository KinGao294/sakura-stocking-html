"""Open stocking-play.html via file:// in headless Chrome, check errors, pull a stocking, screenshot."""
import sys, pathlib
from playwright.sync_api import sync_playwright
html = pathlib.Path(sys.argv[1]).resolve(); out = sys.argv[2]
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1920, 'height': 1080})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('requestfailed', lambda r: logs.append(f'REQFAIL: {r.url}'))
    pg.goto(html.as_uri() + '?nodemo'); pg.wait_for_timeout(2500)
    print('url:', pg.url)
    print('has __toy:', pg.evaluate('!!window.__toy'), '| webgl canvas size:', pg.evaluate("[document.getElementById('c').width, document.getElementById('c').height]"))
    pg.screenshot(path=f'{out}/v2_singlefile_rest.png')
    sx, sy = pg.evaluate("window.__toy.screenOfAnchor('left')")
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx - 300, sy, steps=10); pg.wait_for_timeout(1500)
    print('left D while dragging:', round(pg.evaluate("window.__toy.rigs.left.D.length()"), 3))
    pg.screenshot(path=f'{out}/v2_singlefile_left_pull.png')
    pg.mouse.up()
    b.close()
print('\n'.join(logs) or 'console: clean (no messages)')
