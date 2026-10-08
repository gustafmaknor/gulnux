{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;
in
{
  options.gulnux.desktop.enable = lib.mkEnableOption "Gulnux Sway-skrivbord" // { default = true; };

  config = lib.mkIf cfg.desktop.enable {
    programs.sway = {
      enable = true;
      wrapperFeatures.gtk = true;
      extraPackages = with pkgs; [
        foot
        waybar
        fuzzel
        mako
        grim
        slurp
        wl-clipboard
        brightnessctl
        playerctl
        swaylock
        swayidle
      ];
    };
    environment.etc."sway/config".source = lib.mkForce ../../config/sway/config;

    # Textbaserad inloggning som startar Sway
    services.greetd = {
      enable = true;
      settings.default_session.command =
        "${pkgs.tuigreet}/bin/tuigreet --time --remember --cmd sway";
    };

    security.polkit.enable = true;
    security.pam.services.swaylock = { };

    services.pipewire = {
      enable = true;
      alsa.enable = true;
      pulse.enable = true;
    };

    fonts.packages = with pkgs; [
      nerd-fonts.jetbrains-mono
      noto-fonts
      noto-fonts-color-emoji
    ];
  };
}
