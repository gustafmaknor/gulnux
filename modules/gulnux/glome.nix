{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;

  glome = pkgs.writeShellApplication {
    name = "glome";
    runtimeInputs = [ pkgs.chromium pkgs.jq ];
    text = builtins.readFile ../../scripts/glome.sh;
  };

  glome-mcp = pkgs.writeShellApplication {
    name = "glome-mcp";
    runtimeInputs = [ glome pkgs.chromium pkgs.curl pkgs.nodejs pkgs.util-linux ];
    text = builtins.readFile ../../scripts/glome-mcp.sh;
  };

  glome-read = pkgs.writeShellApplication {
    name = "glome-read";
    runtimeInputs = [ pkgs.nodejs ];
    text = ''exec node ${../../scripts/glome-read.mjs} "$@"'';
  };

  glome-desktop = pkgs.makeDesktopItem {
    name = "glome";
    desktopName = "Glome";
    genericName = "Webbläsare";
    exec = "glome %U";
    icon = "chromium";
    categories = [ "Network" "WebBrowser" ];
    mimeTypes = [ "text/html" "x-scheme-handler/http" "x-scheme-handler/https" ];
  };
in
{
  options.gulnux.glome.enable = lib.mkEnableOption "webbläsaren Glome" // { default = cfg.desktop.enable; };

  config = lib.mkIf cfg.glome.enable {
    environment.systemPackages = [ glome glome-mcp glome-read glome-desktop ];

    xdg.mime.defaultApplications = {
      "text/html" = "glome.desktop";
      "x-scheme-handler/http" = "glome.desktop";
      "x-scheme-handler/https" = "glome.desktop";
    };

    environment.etc."gulnux/commands/glome.md".source = ../../agent/commands/glome.md;

    # Gulnux knappar (sök, Good Times, Greed) alltid synliga i verktygsfältet, inte bakom pusselbiten
    programs.chromium.extraOpts.ExtensionSettings = lib.genAttrs [
      "okelhmbnolibhpnjedoejgidbpnnoolh" # Gulnux sök
      "ggkddmolbkjjhlicmldkhpflblbleocb" # Good Times
      "ccbiciocgndmnhmblociljbphlibegne" # Greed
    ] (_: { toolbar_pin = "force_pinned"; });
  };
}
