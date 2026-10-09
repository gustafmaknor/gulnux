# Gulnux på användarnivå: git, minne, observation och reflektion.
# Aktiveras med `gulnux-home` och kräver inte sudo.
{ config, lib, installningar, ... }:
let
  cfg = config.gulnux.larande;
in
{
  options.gulnux.larande = {
    observera = lib.mkEnableOption "att Gulnux loggar vilka program och kommandon du använder (bara lokalt)" // { default = true; };
    reflektera = lib.mkEnableOption "att Gulnux regelbundet föreslår förbättringar utifrån hur du använder datorn" // { default = true; };
    intervall = lib.mkOption {
      type = lib.types.str;
      default = "weekly";
      description = "Hur ofta Gulnux reflekterar (systemd OnCalendar, t.ex. \"daily\" eller \"Sun 20:00\").";
    };
  };

  config = {
    home.username = installningar.anvandarnamn;
    home.homeDirectory = "/home/${installningar.anvandarnamn}";
    home.stateVersion = "26.05";
    programs.home-manager.enable = true;

    home.sessionVariables = {
      GULNUX_PERSONLIG = "${config.home.homeDirectory}/gulnux-personlig";
      GULNUX_AGENT = installningar.agent or "claude";
    };

    programs.git = {
      enable = true;
      settings = {
        user.name = installningar.namn;
        user.email = installningar.epost;
        init.defaultBranch = "main";
        credential."https://github.com".helper = "!gh auth git-credential";
      };
    };

    # Observation i terminalen: bara kommandots namn och om det lyckades, aldrig argument
    programs.bash = {
      enable = true;
      initExtra = lib.mkIf cfg.observera (builtins.readFile ./observera.bash);
    };
    # Programfönster observeras av gul-observera (startas av Sway), som läser den här flaggan
    xdg.configFile."gulnux/larande-av" = lib.mkIf (!cfg.observera) {
      text = "Observation är avstängd i home.nix (gulnux.larande.observera)\n";
    };

    systemd.user.services.gulnux-reflektera = lib.mkIf cfg.reflektera {
      Unit.Description = "Gulnux reflekterar och föreslår förbättringar";
      Service = {
        Type = "oneshot";
        ExecStart = "/run/current-system/sw/bin/gul reflektera";
        Environment = [ "PATH=/run/current-system/sw/bin:${config.home.profileDirectory}/bin" ];
      };
    };
    systemd.user.timers.gulnux-reflektera = lib.mkIf cfg.reflektera {
      Unit.Description = "Kör Gulnux reflektion regelbundet";
      Timer = {
        OnCalendar = cfg.intervall;
        Persistent = true;
        RandomizedDelaySec = "1h";
      };
      Install.WantedBy = [ "timers.target" ];
    };
  };
}
