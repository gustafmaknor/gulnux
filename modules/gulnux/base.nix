{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;
in
{
  # Användarna kommer från de personliga repona: maskinens ägare läggs till automatiskt
  # (se lib/personlig.nix), och fler kan läggas till i maskinens hosts/<maskin>/default.nix.
  options.gulnux.users = lib.mkOption {
    type = lib.types.attrsOf (lib.types.submodule {
      options = {
        namn = lib.mkOption {
          type = lib.types.str;
          default = "";
          description = "Fullständigt namn.";
        };
        admin = lib.mkOption {
          type = lib.types.bool;
          default = false;
          description = "Får använda sudo och bygga om systemet.";
        };
      };
    });
    default = { };
    description = "Gulnux-användare på den här maskinen. Var och en har sitt eget personliga repo.";
  };

  config = {
    nix.settings.experimental-features = [ "nix-command" "flakes" ];
    nix.settings.trusted-users = [ "@wheel" ];
    nix.gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
    nixpkgs.config.allowUnfree = true; # claude-code är unfree

    networking.networkmanager.enable = true;

    time.timeZone = "Europe/Stockholm";
    i18n.defaultLocale = "sv_SE.UTF-8";
    console.keyMap = "sv-latin1";

    # Lösenord sätts vid installationen (eller med `sudo passwd <namn>`), aldrig i repot
    users.users = lib.mapAttrs (_: u: {
      isNormalUser = true;
      description = u.namn;
      extraGroups = [ "networkmanager" "video" "audio" ] ++ lib.optional u.admin "wheel";
    }) cfg.users;

    # Agenter laddar ofta ner färdiga binärer (npm, uv, egna installerare).
    # nix-ld gör att de går att köra på NixOS.
    programs.nix-ld.enable = true;

    environment.systemPackages = with pkgs; [
      git
      gh
      vim
      curl
      wget
      ripgrep
      fd
      jq
      tmux
      htop
      unzip
      nodejs
      python3
      uv
      home-manager
      libnotify
    ];
  };
}
