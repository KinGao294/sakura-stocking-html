import sys, time, subprocess, socket
from playwright.sync_api import sync_playwright
root = sys.argv[1]; out = sys.argv[2]
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1920, 'height': 1080})
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        pg.goto(f'http://127.0.0.1:{port}/index.html?nodemo')
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{out}/01_rest.png')
        # real mouse drag on right thigh
        box = pg.evaluate("(()=>{const r=document.getElementById('c').getBoundingClientRect();return [r.width,r.height]})()")
        steps = [(0.0,'02_grab'),(0.45,'03_mid_pull'),(1.0,'04_full_sail')]
        sx, sy = 1920*0.565, 1080*0.47
        pg.mouse.move(sx, sy); pg.mouse.down()
        for frac, name in steps:
            pg.mouse.move(sx + frac*560, sy + frac*40, steps=8)
            pg.wait_for_timeout(1500)
            pg.screenshot(path=f'{out}/{name}.png')
        pg.mouse.up()
        pg.wait_for_timeout(120)
        pg.screenshot(path=f'{out}/05_release_bounce.png')
        pg.evaluate("window.__toy.settle(480)")
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'{out}/06_settled.png')
        print('settled D=', pg.evaluate("window.__toy.state.D.length()"), 'shell active=', pg.evaluate("window.__toy.state.active"))
        # auto demo
        pg.close()
        pg2 = b.new_page(viewport={'width': 1920, 'height': 1080})
        pg2.on('pageerror', lambda e: logs.append(f'PAGEERROR2: {e}'))
        pg2.goto(f'http://127.0.0.1:{port}/index.html')
        pg2.wait_for_function("window.__toy && window.__toy.state.D.length() > 0.2", timeout=40000)
        pg2.screenshot(path=f'{out}/07_auto_demo.png')
        pg2.wait_for_function("window.__toy && !window.__toy.state.grabbing", timeout=40000)
        print('auto demo ran and released')
        # portrait / phone
        pg2.close()
        pg3 = b.new_page(viewport={'width': 430, 'height': 900}, has_touch=True, is_mobile=True)
        pg3.goto(f'http://127.0.0.1:{port}/index.html?nodemo'); pg3.wait_for_timeout(1500)
        pg3.evaluate("(()=>{const T=window.__toy;T.grab(-0.55,0.68);T.pullWorld(0.26,-0.03,0);T.settle(240)})()")
        pg3.wait_for_timeout(800)
        pg3.screenshot(path=f'{out}/08_portrait_pull.png')
        fps = pg3.evaluate("new Promise(r=>{let n=0,t0=performance.now();function f(){n++;if(performance.now()-t0<1000)requestAnimationFrame(f);else r(n)}requestAnimationFrame(f)})")
        print('fps(swiftshader):', fps)
        print('\n'.join(logs) or 'no console output')
        b.close()
finally:
    srv.terminate()
