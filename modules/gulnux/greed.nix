# Greed: det självkurerande flödet på systemnivå – programmet och Glome-tillägget.
# Vad och när ställer varje användare in i home.nix (gulnux.greed).
{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux.greed;

  python = pkgs.python3.withPackages (ps: [ ps.feedparser ps.trafilatura ]);

  greed = pkgs.writeShellApplication {
    name = "greed";
    runtimeInputs = [ pkgs.libnotify ];
    text = ''
      export PYTHONPATH=${../../apps/greed}:${../../apps/gulsearch}
      export GREED_PROMPTS=${../../agent/prompts}
      exec ${python}/bin/python -m greed "$@"
    '';
  };

  # Greed som eget program i programstartaren, i ett eget Glome-fönster precis som Gloffice
  greed-desktop = pkgs.makeDesktopItem {
    name = "greed";
    desktopName = "Greed";
    genericName = "Nyhetsflöde";
    comment = "Ditt självkurerande flöde";
    exec = "greed";
    icon = "${../../apps/greed/greed/static/ikon.svg}";
    categories = [ "Network" "News" ];
  };
in
{
  options.gulnux.greed.enable = lib.mkEnableOption "Greed, det självkurerande flödet" // { default = config.gulnux.glome.enable; };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ greed greed-desktop ];
    environment.etc."gulnux/greed-tillagg".source = ../../apps/greed-tillagg;
  };
}
