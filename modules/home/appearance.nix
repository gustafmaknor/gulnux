# Gulnux utseende på användarnivå: tema för panel, terminal, programstartare, notiser,
# låsskärm och GTK-program. Allt går att ändra i home.nix, t.ex.
#   gulnux.appearance.enable = false;                       # helt eget utseende
#   xdg.configFile."foot/foot.ini".source = lib.mkForce ./foot.ini;
{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux.appearance;

  # Gul accent i GTK-program (adw-gtk3 och libadwaita läser de här färgerna)
  accent = ''
    @define-color accent_color #8A6100;
    @define-color accent_bg_color #F5C518;
    @define-color accent_fg_color #1F1D18;
  '';
in
{
  options.gulnux.appearance.enable = lib.mkEnableOption "Gulnux ljusa tema med gul accent" // { default = true; };

  config = lib.mkIf cfg.enable {
    xdg.configFile = {
      "waybar/config.jsonc".source = ../../config/waybar/config.jsonc;
      "waybar/style.css".source = ../../config/waybar/style.css;
      "foot/foot.ini".source = ../../config/foot/foot.ini;
      "fuzzel/fuzzel.ini".source = ../../config/fuzzel/fuzzel.ini;
      "networkmanager-dmenu/config.ini".source = ../../config/networkmanager-dmenu/config.ini;
      "mako/config".source = ../../config/mako/config;
      "swaylock/config".source = ../../config/swaylock/config;
    };

    gtk = {
      enable = true;
      theme = {
        name = "adw-gtk3";
        package = pkgs.adw-gtk3;
      };
      iconTheme = {
        name = "Papirus";
        package = pkgs.papirus-icon-theme;
      };
      font = {
        name = "Lexend";
        size = 11;
      };
      gtk3.extraCss = accent;
      gtk4.extraCss = accent;
    };

    home.pointerCursor = {
      name = "Bibata-Modern-Amber";
      package = pkgs.bibata-cursors;
      size = 24;
      gtk.enable = true;
    };

    dconf.settings."org/gnome/desktop/interface" = {
      color-scheme = "prefer-light";
      accent-color = "yellow";
      font-name = "Lexend 11";
      monospace-font-name = "JetBrainsMono Nerd Font 11";
    };
  };
}
