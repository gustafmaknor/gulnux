{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;

  lexend = pkgs.google-fonts.override { fonts = [ "Lexend" ]; };

  bakgrund = pkgs.runCommand "gulnux-bakgrund.png" { nativeBuildInputs = [ pkgs.librsvg ]; } ''
    rsvg-convert --width 2880 --height 1800 ${../../config/branding/bakgrund.svg} -o $out
  '';
in
{
  options.gulnux.desktop.enable = lib.mkEnableOption "Gulnux Sway-skrivbord" // { default = true; };

  config = lib.mkIf cfg.desktop.enable {
    # SwayFX: Sway med rundade hörn, skuggor och oskärpa. Samma konfiguration i övrigt.
    programs.sway = {
      enable = true;
      package = pkgs.swayfx;
      wrapperFeatures.gtk = true;
      extraPackages = with pkgs; [
        foot
        waybar
        fuzzel
        mako
        libnotify
        grim
        slurp
        wl-clipboard
        brightnessctl
        playerctl
        swaylock-effects
        swayidle
      ];
    };
    environment.etc."sway/config".source = lib.mkForce ../../config/sway/config;
    environment.etc."gulnux/bakgrund.png".source = bakgrund;
    environment.etc."gulnux/logo.svg".source = ../../config/branding/logo.svg;

    # Grafisk inloggning (ReGreet i cage) i Gulnux färger
    programs.regreet = {
      enable = true;
      theme = {
        package = pkgs.adw-gtk3;
        name = "adw-gtk3";
      };
      iconTheme = {
        package = pkgs.papirus-icon-theme;
        name = "Papirus";
      };
      cursorTheme = {
        package = pkgs.bibata-cursors;
        name = "Bibata-Modern-Amber";
      };
      font = {
        package = lexend;
        name = "Lexend";
        size = 12;
      };
      settings = {
        background = {
          path = "/etc/gulnux/bakgrund.png";
          fit = "Cover";
        };
        GTK.application_prefer_dark_theme = false;
        widget.clock.format = "%A %-d %B  %H:%M";
      };
      extraCss = builtins.readFile ../../config/regreet/style.css;
    };

    # Lugn uppstart: tillverkarens logga och en snurra i stället för rullande text
    boot.plymouth.enable = true;
    boot.consoleLogLevel = 3;
    boot.initrd.verbose = false;
    boot.kernelParams = [ "quiet" "splash" "udev.log_level=3" ];

    security.polkit.enable = true;
    security.pam.services.swaylock = { };
    programs.dconf.enable = true;

    services.pipewire = {
      enable = true;
      alsa.enable = true;
      pulse.enable = true;
    };

    # Teman som gränssnittet och varje användares Home Manager-tema bygger på
    environment.systemPackages = with pkgs; [
      adw-gtk3
      papirus-icon-theme
      bibata-cursors
    ];
    environment.sessionVariables = {
      XCURSOR_THEME = "Bibata-Modern-Amber";
      XCURSOR_SIZE = "24";
    };

    fonts.packages = with pkgs; [
      lexend
      jetbrains-mono
      nerd-fonts.jetbrains-mono
      noto-fonts
      noto-fonts-color-emoji
    ];
    fonts.fontconfig.defaultFonts = {
      sansSerif = [ "Lexend" "Noto Sans" ];
      monospace = [ "JetBrainsMono Nerd Font" ];
      emoji = [ "Noto Color Emoji" ];
    };

    # Glome (Chromium) följer paletten: papperston i verktygsfältet
    programs.chromium = {
      enable = true;
      extraOpts.BrowserThemeColor = "#F7F4EC";
    };
  };
}
