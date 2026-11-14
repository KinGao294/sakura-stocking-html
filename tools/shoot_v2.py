"""v2 verification: both legs pullable, skirt reacts (clamped), multi-pointer, auto demo, settle."""
import sys, time, json, subprocess, socket
from playwright.sync_api import sync_playwright
root, out = sys.argv[1], sys.argv[2]
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
def hook(pg, tag):
    pg.on('console', lambda m: logs.append(f'[{tag}] {m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'[{tag}] PAGEERROR: {e}'))
def skirt(pg):
    return pg.evaluate("(()=>{const k=window.__toy.skirt;return {sx:+k.sx.toFixed(5),sz:+k.sz.toFixed(5),flare:+k.flare.toFixed(5),rip:+k.rip.toFixed(5)}})()")
def drag(pg, side, frac_dx, name, dy=0.0):
    sx, sy = pg.evaluate(f"window.__toy.screenOfAnchor('{side}')")
    pg.mouse.move(sx, sy); pg.mouse.down()
    sign = 1 if side == 'right' else -1
    pg.mouse.move(sx + sign * frac_dx, sy + dy, steps=10)
    pg.wait_for_timeout(1400)
    st = pg.evaluate(f"(()=>{{const S=window.__toy.rigs['{side}'];return {{grab:S.grabbing,D:+S.D.length().toFixed(3)}}}})()")
    pg.screenshot(path=f'{out}/{name}.png')
    return st
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        pg = b.new_page(viewport={'width': 1920, 'height': 1080}); hook(pg, 'main')
        pg.goto(f'http://127.0.0.1:{port}/index.html?nodemo'); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{out}/v2_rest.png')
        # anchors near the outer-back of each thigh (screen coords from the page itself)
        pg.evaluate("window.__toy.grab('left',-0.55,0.68); window.__toy.release(); window.__toy.grab('right',-0.55,0.68); window.__toy.release(); window.__toy.settle(400)")
        r = drag(pg, 'left', 300, 'v2_left_mid_pull'); print('left drag  ->', r, 'right untouched D=', pg.evaluate("window.__toy.rigs.right.D.length()"))
        pg.mouse.up(); pg.evaluate("window.__toy.settle(600)")
        r = drag(pg, 'right', 300, 'v2_right_mid_pull'); print('right drag ->', r, 'left untouched D=', pg.evaluate("window.__toy.rigs.left.D.length()"))
        pg.mouse.up(); pg.evaluate("window.__toy.settle(600)")
        # skirt sway during a fast drag: sample skirt state while the pointer is moving
        sx, sy = pg.evaluate("window.__toy.screenOfAnchor('right')")
        pg.mouse.move(sx, sy); pg.mouse.down()
        peak = {'sx': 0, 'sz': 0, 'flare': 0, 'rip': 0}
        for i in range(6):
            pg.mouse.move(sx + 90 * (i + 1), sy + (25 if i % 2 else -25), steps=2)
            pg.wait_for_timeout(250)
            k = skirt(pg); peak = {q: max(peak[q], abs(k[q])) for q in peak}
        pg.screenshot(path=f'{out}/v2_skirt_sway_during_pull.png')
        print('skirt peak during pull:', peak, 'limits:', pg.evaluate("window.__toy.skirtLimits"))
        pg.mouse.up(); pg.wait_for_timeout(300)
        print('skirt just after release:', skirt(pg))
        # multi-pointer: two synthetic pointers grab both thighs at once
        res = pg.evaluate("""(()=>{
          const c=document.getElementById('c'); const T=window.__toy;
          T.settle(600);
          const [lx,ly]=T.screenOfAnchor('left'), [rx,ry]=T.screenOfAnchor('right');
          window.__ev=(type,id,x,y)=>c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:id===11}));
          window.__mt={lx,ly,rx,ry};
          __ev('pointerdown',11,lx,ly); __ev('pointerdown',12,rx,ry);
          __ev('pointermove',11,lx-260,ly+20); __ev('pointermove',12,rx+260,ry+20);
          T.settle(200);
          return {L:+T.rigs.left.D.length().toFixed(3),R:+T.rigs.right.D.length().toFixed(3),Lg:T.rigs.left.grabbing,Rg:T.rigs.right.grabbing};})()""")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=f'{out}/v2_multitouch_both.png')
        res2 = pg.evaluate("""(()=>{const T=window.__toy,m=window.__mt; __ev('pointerup',11,m.lx-260,m.ly+20); T.settle(30);
          return {afterLift11_leftGrab:T.rigs.left.grabbing, rightStillGrab:T.rigs.right.grabbing};})()""")
        print('multi-pointer:', res, res2)
        pg.evaluate("(()=>{const m=window.__mt; __ev('pointerup',12,m.rx+260,m.ry+20);})()")
        pg.evaluate("window.__toy.settle(900)")
        pg.wait_for_timeout(800)
        pg.screenshot(path=f'{out}/v2_settled.png')
        print('settled:', pg.evaluate("(()=>{const T=window.__toy;return {L:T.rigs.left.D.length(),R:T.rigs.right.D.length(),Lact:T.rigs.left.active,Ract:T.rigs.right.active}})()"), 'skirt:', skirt(pg))
        # ---- HARD LIMIT check: skirt alone on black, rest vs. forced worst-case sway/flare/ripple
        import numpy as np
        from PIL import Image
        pg.evaluate("document.getElementById('grain').style.display='none'; document.getElementById('vig').style.display='none'; window.__toy.hideHint(); window.__toy.showBody(false)")
        def lowest_rows(path):
            a = np.asarray(Image.open(path).convert('RGB')).max(axis=2)
            H, W = a.shape; rows = np.full(W, -1)
            for x in range(W):
                ys = np.nonzero(a[:, x] > 10)[0]
                if len(ys): rows[x] = ys.max()
            return rows
        pg.evaluate("window.__toy.setSkirt({sx:0,sz:0,flare:0,rip:0,ripPh:0,side:0})"); pg.wait_for_timeout(700)
        pg.screenshot(path='/tmp/hem_rest.png'); rest = lowest_rows('/tmp/hem_rest.png')
        lim = pg.evaluate("window.__toy.skirtLimits")
        worst_med, worst_col = 0.0, 0.0
        for side in (-1, 1):
            for ph in np.linspace(0, 6.28, 6, endpoint=False):
                for sx in (-lim['sway'], lim['sway']):
                    pg.evaluate(f"window.__toy.setSkirt({{sx:{sx},sz:{-lim['sway']},flare:{lim['flareMax']},rip:{lim['rip']},ripPh:{ph},side:{side}}})")
                    pg.wait_for_timeout(350)
                    pg.screenshot(path='/tmp/hem_test.png'); r = lowest_rows('/tmp/hem_test.png')
                    m = (rest > 0) & (r > 0); cols = np.nonzero(m)[0]
                    central = cols[(cols > np.percentile(cols, 15)) & (cols < np.percentile(cols, 85))]
                    # positive = hem moved UP on screen beyond what lateral sway explains: compare each column with the
                    # highest rest hem point within the max lateral sway reach (+-25 px ~ 12 mm)
                    up = np.array([rest[max(0, x - 25):x + 26].min() - r[x] for x in central])
                    worst_med = max(worst_med, float(np.median(up))); worst_col = max(worst_col, float(up.max()))
        Image.open('/tmp/hem_test.png').save(f'{out}/v2_hem_worstcase_skirt_only.png')
        # px -> mm at the subject plane (vertical view height = 2*0.26 m over 1080 px)
        mm = 520.0 / 1080
        print(f'hem worst case: median rise {worst_med:.1f}px ({worst_med*mm:.2f} mm), max single-column rise (sway-compensated) {worst_col:.1f}px ({worst_col*mm:.2f} mm)')
        pg.evaluate("window.__toy.setSkirt(null); window.__toy.showBody(true); document.getElementById('grain').style.display=''; document.getElementById('vig').style.display=''")
        pg.close()
        # auto demo alternates legs
        pg2 = b.new_page(viewport={'width': 1920, 'height': 1080}); hook(pg2, 'demo')
        pg2.goto(f'http://127.0.0.1:{port}/index.html')
        pg2.wait_for_function("window.__toy && window.__toy.rigs.right.D.length() > 0.15", timeout=180000)
        print('demo pulled right')
        pg2.wait_for_function("window.__toy && window.__toy.rigs.left.D.length() > 0.15", timeout=180000)
        pg2.screenshot(path=f'{out}/v2_auto_demo_left.png')
        print('demo pulled left')
        pg2.wait_for_function("!window.__toy.demoActive()", timeout=180000)
        print('demo finished, control yielded')
        pg2.close(); b.close()
finally:
    srv.terminate()
print('\n'.join(logs) or 'no console output')
