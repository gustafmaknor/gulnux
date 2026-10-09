# Good Times: lär datorn arbetsuppgifterna i användarens webbappar.
# Kommandot gt, MCP-servern (gt mcp), GT-knappen i Glome och dess väg in (native messaging).
{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux.gt;

  # Tilläggets fasta id (från nyckeln i apps/gt-tillagg/manifest.json)
  tillaggId = "ggkddmolbkjjhlicmldkhpflblbleocb";

  gt = pkgs.writeShellApplication {
    name = "gt";
    runtimeInputs = [ pkgs.nodejs pkgs.libnotify pkgs.foot ];
    text = ''
      export GT_CHROMIUM=${pkgs.chromium}/bin/chromium
      export GT_PROMPTS=${../../agent/prompts}
      exec node ${../../apps/gt}/gt.mjs "$@"
    '';
  };

  gt-native-host = pkgs.writeShellApplication {
    name = "gt-native-host";
    runtimeInputs = [ pkgs.nodejs ];
    text = ''
      export GT_BIN=${gt}/bin/gt
      exec node ${../../apps/gt}/native-host.mjs "$@"
    '';
  };
in
{
  options.gulnux.gt.enable = lib.mkEnableOption "Good Times" // { default = config.gulnux.glome.enable; };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ gt gt-native-host ];

    environment.etc."gulnux/gt-tillagg".source = ../../apps/gt-tillagg;

    # Chromium hittar värdprogrammet här, oavsett profil. Bara GT-tillägget får använda det.
    environment.etc."chromium/native-messaging-hosts/se.gulnux.gt.json".text = builtins.toJSON {
      name = "se.gulnux.gt";
      description = "Good Times";
      path = "${gt-native-host}/bin/gt-native-host";
      type = "stdio";
      allowed_origins = [ "chrome-extension://${tillaggId}/" ];
    };
  };
}
