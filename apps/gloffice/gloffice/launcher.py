"""Startar webbservern vid behov och öppnar Gloffice som ett eget fönster i Glome."""

import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from urllib.parse import quote

from . import core, web

QUIET = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL,
         "start_new_session": True}


def server_running():
    request = urllib.request.Request(f"{web.base_url()}/api/ping", headers={"X-Gloffice": "1"})
    try:
        with urllib.request.urlopen(request, timeout=1) as response:
            return response.status == 200
    except OSError:
        return False


def ensure_server():
    if server_running():
        return
    subprocess.Popen([sys.executable, "-m", "gloffice", "serve"], **QUIET)
    for _ in range(50):
        if server_running():
            return
        time.sleep(0.1)
    raise core.GlofficeError("Kunde inte starta Gloffice-servern")


def open_ui(path=None):
    ensure_server()
    url = f"{web.base_url()}/"
    if path:
        url += "#" + quote(str(core.resolve(path)))
    if shutil.which("glome"):
        subprocess.Popen(["glome", f"--app={url}"], **QUIET)
    else:
        webbrowser.open(url)
    return f"Öppnade {url} i Glome"
