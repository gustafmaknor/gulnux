# Greed på användarnivå: när agenten väljer ut och hur mycket, och bakgrundstjänsten.
# Källorna ligger i ~/gulnux-personal/greed/sources.json och intressena i memory/greed.md.
{ config, lib, ... }:
let
  cfg = config.gulnux.greed;
in
{
  options.gulnux.greed = {
    enable = lib.mkEnableOption "Greed för den här användaren" // { default = true; };
    times = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "07:00" "12:00" "18:00" ];
      description = "När agenten väljer ut. Det första urvalet för dagen kommer som en morgonbrief.";
    };
    picks = lib.mkOption {
      type = lib.types.ints.between 1 30;
      default = 8;
      description = "Högst så många poster per urval.";
    };
    surprise = lib.mkOption {
      type = lib.types.ints.between 0 5;
      default = 1;
      description = "Poster utanför din profil per urval, så att flödet inte blir en bubbla.";
    };
    keepDays = lib.mkOption {
      type = lib.types.int;
      default = 30;
      description = "Inlägg som inte valts ut, sparats eller fått Mer/Mindre rensas efter så många dagar.";
    };
  };

  config = lib.mkIf cfg.enable {
    xdg.configFile."greed/config.json".text = builtins.toJSON {
      inherit (cfg) times picks surprise;
      keep_days = cfg.keepDays;
    };

    systemd.user.services.greed = {
      Unit = {
        Description = "Greed collects your feed and lets your agent pick what matters";
        ConditionPathExists = "/run/current-system/sw/bin/greed";
      };
      Service = {
        ExecStart = "/run/current-system/sw/bin/greed watch";
        Restart = "on-failure";
        RestartSec = 60;
        Environment = [ "PATH=/run/current-system/sw/bin:${config.home.profileDirectory}/bin" ];
        Nice = 10;
      };
      Install.WantedBy = [ "default.target" ];
    };
  };
}
