import sys, time, subprocess, socket
from playwright.sync_api import sync_playwright
root=sys.argv[1]
s=socket.socket(); s.bind(('127.0.0.1',0)); port=s.getsockname()[1]; s.close()
srv=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1280,'height':720})
    pg.goto(f'http://127.0.0.1:{port}/index.html?nodemo'); pg.wait_for_timeout(1500)
    print(pg.evaluate("(()=>{const T=window.__toy;T.grab(-0.55,0.68);T.pullWorld(0.3,-0.03,0);T.settle(240);return T.stats()})()"))
    b.close()
finally: srv.terminate()
