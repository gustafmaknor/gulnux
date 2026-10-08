{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;
in
{
  options.gulnux.user = lib.mkOption {
    type = lib.types.str;
    default = "gul";
    description = "Gulnux huvudanvändare.";
  };

  config = {
    nix.settings.experimental-features = [ "nix-command" "flakes" ];
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

    users.users.${cfg.user} = {
      isNormalUser = true;
      extraGroups = [ "wheel" "networkmanager" "video" "audio" ];
      initialPassword = "gulnux"; # byt med `passwd` vid första inloggningen
    };

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
    ];
  };
}
