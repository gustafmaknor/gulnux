# Gulnux på användarnivå: git, minne, observation och reflektion.
# Aktiveras med `gulnux-home` och kräver inte sudo.
{ config, lib, settings, ... }:
let
  cfg = config.gulnux.learning;
in
{
  imports = [
    ./search.nix
    ./appearance.nix
    ./greed.nix
  ];

  options.gulnux.learning = {
    observe = lib.mkEnableOption "att Gulnux loggar vilka program och kommandon du använder (bara lokalt)" // { default = true; };
    reflect = lib.mkEnableOption "att Gulnux regelbundet föreslår förbättringar utifrån hur du använder datorn" // { default = true; };
    interval = lib.mkOption {
      type = lib.types.str;
      default = "weekly";
      description = "Hur ofta Gulnux reflekterar (systemd OnCalendar, t.ex. \"daily\" eller \"Sun 20:00\").";
    };
  };

  config = {
    home.username = settings.username;
    home.homeDirectory = "/home/${settings.username}";
    home.stateVersion = "26.05";
    programs.home-manager.enable = true;

    home.sessionVariables = {
      GULNUX_PERSONAL = "${config.home.homeDirectory}/gulnux-personal";
      GULNUX_AGENT = settings.agent or "claude";
    };

    programs.git = {
      enable = true;
      settings = {
        user.name = settings.name;
        user.email = settings.email;
        init.defaultBranch = "main";
        credential."https://github.com".helper = "!gh auth git-credential";
      };
    };

    # Observation i terminalen: bara kommandots namn och om det lyckades, aldrig argument
    programs.bash = {
      enable = true;
      initExtra = lib.mkIf cfg.observe (builtins.readFile ./observe.bash);
    };
    # Programfönster observeras av gul-observe (startas av Sway), som läser den här flaggan
    xdg.configFile."gulnux/learning-off" = lib.mkIf (!cfg.observe) {
      text = "Observation is turned off in home.nix (gulnux.learning.observe)\n";
    };

    systemd.user.services.gulnux-reflect = lib.mkIf cfg.reflect {
      Unit.Description = "Gulnux reflects and proposes improvements";
      Service = {
        Type = "oneshot";
        ExecStart = "/run/current-system/sw/bin/gul reflect";
        Environment = [ "PATH=/run/current-system/sw/bin:${config.home.profileDirectory}/bin" ];
      };
    };
    systemd.user.timers.gulnux-reflect = lib.mkIf cfg.reflect {
      Unit.Description = "Run Gulnux reflection regularly";
      Timer = {
        OnCalendar = cfg.interval;
        Persistent = true;
        RandomizedDelaySec = "1h";
      };
      Install.WantedBy = [ "timers.target" ];
    };
  };
}
