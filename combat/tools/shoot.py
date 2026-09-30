#!/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
"""Screenshot harness for InfiniteFlight Combat.

Usage: python3 combat/tools/shoot.py <shots.json> <outdir> [--headless]
Serves the project root on port 8472, opens /combat/ in Chromium on the real GPU (Metal), runs each
shot (place the jet, set the view, advance the sim, wait for terrain) and saves PNGs. Prints console
errors and a frame-time estimate.
"""
import json, os, sys, threading, time, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
shots = json.load(open(sys.argv[1])); outdir = sys.argv[2]; headless = '--headless' in sys.argv
os.makedirs(outdir, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', 8472), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

args = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
with sync_playwright() as p:
    b = p.chromium.launch(headless=headless, args=args)
    pg = b.new_page(viewport={'width': 1440, 'height': 810})
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:400]) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERR: ' + str(e)[:600]))
    pg.goto('http://127.0.0.1:8472/combat/index.html')
    pg.wait_for_function('window.IFC !== undefined', timeout=30000)
    print('renderer:', pg.evaluate("""() => { const gl = IFC.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }"""))
    for s in shots:
        pg.evaluate("""(s) => {
          document.body.classList.toggle('hideui', !!s.hideui);
          if (s.time !== undefined) IFC.env.setTimeOfDay(s.time);
          if (s.place) IFC.place(s.place);
          if (s.setup) (new Function('IFC', s.setup))(IFC);
          IFC.setView(s.view || 'chase');
          if (s.cam) IFC.cam(s.cam);
          IFC.setFreeze(true);
          if (s.advance) IFC.advance(s.advance);
        }""", s)
        # Let terrain stream in around the new camera position.
        t0 = time.time()
        while time.time() - t0 < s.get('wait', 25):
            st = pg.evaluate('IFC.terrainReady()')
            if st['inflight'] == 0 and st['queued'] == 0 and time.time() - t0 > 3: break
            pg.wait_for_timeout(500)
        pg.wait_for_timeout(600)
        ft = pg.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 30) requestAnimationFrame(f); else r((performance.now() - t0) / 30); }; requestAnimationFrame(f); })""")
        path = os.path.join(outdir, s['name'] + '.png')
        pg.screenshot(path=path)
        extra = pg.evaluate('window.__trap || ""')
        if extra: print('  data:', extra); pg.evaluate('window.__trap = ""')
        print(f"shot {s['name']}  frame {ft:.1f} ms  terrain {pg.evaluate('IFC.terrainReady()')}")
    print('\n'.join(logs[:40]) or 'no console errors')
    b.close()
httpd.shutdown()
