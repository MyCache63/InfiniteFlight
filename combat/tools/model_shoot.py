#!/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
"""Screenshot harness for the F-14 model viewer (combat/tools/model_viewer.html).

Usage: python3 combat/tools/model_shoot.py <outdir> [shot names ...]
Serves the repo root on port 8473, opens the viewer in headed Chromium on the real GPU (Metal), sets each
view and configuration, saves PNGs and prints the triangle count, draw calls and frame time.
"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
outdir = sys.argv[1]
os.makedirs(outdir, exist_ok=True)

SHOTS = {
    'side':      {'view': 'side'},
    'top20':     {'view': 'top', 'gear': 0},
    'top68':     {'view': 'top', 'gear': 0, 'sweep': 68},
    'front':     {'view': 'front'},
    'rear':      {'view': 'rear', 'ab': 1},
    'q1':        {'view': 'q1'},
    'q2':        {'view': 'q2'},
    'q3up68':    {'view': 'q3', 'gear': 0, 'sweep': 68},
    'q4':        {'view': 'q4'},
    'top34_68':  {'view': 'top34', 'gear': 0, 'sweep': 68},
    'under':     {'view': 'under', 'gear': 0, 'showGround': False},
    'nose':      {'view': 'nose'},
    'intake':    {'view': 'intake'},
    'tail':      {'view': 'tail', 'speedbrake': 1, 'hookPos': 1},
    'config':    {'view': 'q1', 'flaps': 1, 'slats': 1, 'speedbrake': 1, 'hookPos': 1, 'ds': 10, 'dr': 15, 'sp': 1},
    'sbk':       {'view': 'sbk', 'speedbrake': 1},
    'hookv':     {'view': 'hookv', 'hookPos': 1, 'speedbrake': 1},
    'wingc':     {'view': 'wingc', 'flaps': 1, 'slats': 1, 'sp': 1},
    'sideconf':  {'view': 'side', 'speedbrake': 1, 'hookPos': 1, 'flaps': 1, 'slats': 1, 'ds': -15, 'dr': 20},
    'gearmid':   {'view': 'q3', 'gear': 0.5},
    'cockpit':   {'view': 'cockpit'},
    'rearseat':  {'view': 'rearseat'},
}
names = sys.argv[2:] or list(SHOTS)
BASE = {'sweep': 20, 'gear': 1, 'flaps': 0, 'slats': 0, 'speedbrake': 0, 'hookPos': 0, 'ab': 0, 'ds': 0, 'da': 0, 'dr': 0, 'sp': 0, 'showGround': True}

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', 8473), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch(headless=False, args=['--use-angle=metal', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1400, 'height': 800})
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:400]) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERR: ' + str(e)[:800]))
    pg.goto('http://127.0.0.1:8473/combat/tools/model_viewer.html')
    try:
        pg.wait_for_function('window.VREADY === true', timeout=30000)
    except Exception:
        print('\n'.join(logs)); raise
    pg.evaluate("document.body.classList.add('hideui')")
    for n in names:
        s = dict(BASE); s.update(SHOTS[n])
        pg.evaluate('(s) => V.set(s)', s)
        pg.wait_for_timeout(350)
        ft = pg.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 30) requestAnimationFrame(f); else r((performance.now() - t0) / 30); }; requestAnimationFrame(f); })""")
        path = os.path.join(outdir, n + '.png')
        pg.screenshot(path=path)
        print(f"{n:10s} frame {ft:5.1f} ms  {pg.evaluate('V.info()')}")
    print('\n'.join(logs[:40]) or 'no console errors')
    b.close()
httpd.shutdown()
