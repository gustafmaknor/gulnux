"""Vektorer (embeddings) från ollama på den här datorn."""

import json
import urllib.request


class InbaddningFel(Exception):
    pass


class Klient:
    def __init__(self, url, modell):
        self.url = url.rstrip("/")
        self.modell = modell

    def vektorer(self, texter):
        data = json.dumps({"model": self.modell, "input": texter}).encode()
        request = urllib.request.Request(f"{self.url}/api/embed", data=data,
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                svar = json.load(response)
        except (OSError, ValueError) as e:
            raise InbaddningFel(f"ollama is not responding at {self.url} ({e})") from None
        vektorer = svar.get("embeddings")
        if not vektorer or len(vektorer) != len(texter):
            raise InbaddningFel(f"ollama returned no vectors – has the model {self.modell} been pulled?")
        return vektorer

    def tillganglig(self):
        try:
            with urllib.request.urlopen(f"{self.url}/api/tags", timeout=2):
                return True
        except OSError:
            return False
