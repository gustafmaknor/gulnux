# Gulnux sök på användarnivå: vad som indexeras och bakgrundstjänsten som håller indexet aktuellt.
{ config, lib, ... }:
let
  cfg = config.gulnux.search;
in
{
  options.gulnux.search = {
    enable = lib.mkEnableOption "Gulnux sök för den här användaren" // { default = true; };
    sources = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = {
        documents = "~/Document";
        memory = "~/gulnux-personal/memory";
      };
      description = "Kataloger som indexeras, som namn = sökväg. Namnet syns i träffarna.";
    };
    glome = lib.mkOption {
      type = lib.types.enum [ "off" "manual" "auto" ];
      default = "manual";
      description = ''
        Webbsidor i Glome: "off" (aldrig), "manual" (bara när du trycker på knappen eller kör
        gul search save) eller "auto" (varje sida du öppnar, utom undantagen i exclude).
      '';
    };
    exclude = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "bank"
        "nordea"
        "seb.se"
        "kivra"
        "1177.se"
        "skatteverket.se"
        "forsakringskassan.se"
        "mail."
        "outlook."
        "localhost"
        "127.0.0.1"
      ];
      description = "Delar av värdnamn som aldrig indexeras automatiskt. Knappen fungerar ändå.";
    };
  };

  config = lib.mkIf cfg.enable {
    xdg.configFile."gulsok/config.json".text = builtins.toJSON {
      inherit (cfg) sources glome exclude;
    };

    systemd.user.services.gulsok = {
      Unit = {
        Description = "Gulnux search keeps the search index up to date";
        ConditionPathExists = "/run/current-system/sw/bin/gulsok";
      };
      Service = {
        ExecStart = "/run/current-system/sw/bin/gulsok watch";
        Restart = "on-failure";
        RestartSec = 30;
        Environment = [ "PATH=/run/current-system/sw/bin" ];
        Nice = 10; # indexeringen ska inte störa det du gör
      };
      Install.WantedBy = [ "default.target" ];
    };
  };
}
