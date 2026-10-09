# Gulnux sök på systemnivå: programmet, ollama för vektorer och Glome-tillägget.
# Vad som indexeras (källor, Glome-läge, undantag) ställer varje användare in i home.nix.
{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux.sok;

  python = pkgs.python3.withPackages (ps: [
    ps.python-docx
    ps.openpyxl
    ps.python-pptx
    ps.pypdf
    ps.sqlite-vec
  ]);

  gulsok = pkgs.writeShellApplication {
    name = "gulsok";
    text = ''
      export PYTHONPATH=${../../apps/gulsok}:${../../apps/gloffice}
      exec ${python}/bin/python -m gulsok "$@"
    '';
  };
in
{
  options.gulnux.sok = {
    enable = lib.mkEnableOption "Gulnux sök" // { default = config.gulnux.desktop.enable; };
    vektorer = lib.mkEnableOption "vektorsökning med en lokal modell via ollama (ca 1 GB)" // { default = true; };
    modell = lib.mkOption {
      type = lib.types.str;
      default = "bge-m3";
      description = "Embedding-modell i ollama. Bör vara flerspråkig så att svenska fungerar.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ gulsok ];

    services.ollama = lib.mkIf cfg.vektorer {
      enable = true;
      loadModels = [ cfg.modell ];
    };

    environment.etc."gulnux/sok.json".text = builtins.toJSON {
      inherit (cfg) modell;
      ollama = "http://127.0.0.1:11434";
    };
    environment.etc."gulnux/glome-tillagg".source = ../../apps/glome-tillagg;
  };
}
