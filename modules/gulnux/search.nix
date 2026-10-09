# Gulnux sök på systemnivå: programmet, ollama för vektorer och Glome-tillägget.
# Vad som indexeras (källor, Glome-läge, undantag) ställer varje användare in i home.nix.
{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux.search;

  python = pkgs.python3.withPackages (ps: [
    ps.python-docx
    ps.openpyxl
    ps.python-pptx
    ps.pypdf
    ps.sqlite-vec
  ]);

  gulsearch = pkgs.writeShellApplication {
    name = "gulsearch";
    text = ''
      export PYTHONPATH=${../../apps/gulsearch}:${../../apps/gloffice}
      exec ${python}/bin/python -m gulsearch "$@"
    '';
  };
in
{
  options.gulnux.search = {
    enable = lib.mkEnableOption "Gulnux sök" // { default = config.gulnux.desktop.enable; };
    vectors = lib.mkEnableOption "vektorsökning med en lokal modell via ollama (ca 1 GB)" // { default = true; };
    model = lib.mkOption {
      type = lib.types.str;
      default = "bge-m3";
      description = "Embedding-modell i ollama. Bör vara flerspråkig så att svenska fungerar.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ gulsearch ];

    services.ollama = lib.mkIf cfg.vectors {
      enable = true;
      loadModels = [ cfg.model ];
    };

    environment.etc."gulnux/search.json".text = builtins.toJSON {
      inherit (cfg) model;
      ollama = "http://127.0.0.1:11434";
    };
    environment.etc."gulnux/glome-tillagg".source = ../../apps/glome-tillagg;
  };
}
