# Gulnux egna kommandon. Används av NixOS-modulen och av installationsprogrammet.
{ writeShellApplication, coreutils, gawk, git, gh, gnugrep, gnused, jq, libnotify, tmux, util-linux }:
let
  skript = name: runtimeInputs: forord: writeShellApplication {
    inherit name runtimeInputs;
    text = forord + builtins.readFile (../scripts + "/${name}.sh");
  };
in
rec {
  gul = skript "gul" [ coreutils gnugrep jq ] "";
  gul-setup = skript "gul-setup" [ coreutils git gh gnused ] ''
    export GULNUX_MALL=${../templates/personlig}
  '';
  gul-minne = skript "gul-minne" [ gnugrep ] "";
  gul-logg = skript "gul-logg" [ coreutils jq ] "";
  gul-larande = skript "gul-larande" [ coreutils ] "";
  gul-observera = skript "gul-observera" [ jq ] "";
  gul-reflektera = skript "gul-reflektera" [ coreutils git gnugrep gnused libnotify gul-logg ] ''
    export GULNUX_PROMPTER=${../agent/prompts}
  '';
  gul-forslag = skript "gul-forslag" [ coreutils git gnugrep gnused ] "";
  gul-uppdatera = skript "gul-uppdatera" [ git ] "";
  gul-sok = skript "gul-sok" [ ] "";

  # Agentsessionen lever i tmux så att den överlever att terminalen stängs
  gul-session = writeShellApplication {
    name = "gul-session";
    runtimeInputs = [ tmux ];
    text = ''exec tmux new-session -A -s gul "gul; exec bash -l"'';
  };

  gulnux-rebuild = writeShellApplication {
    name = "gulnux-rebuild";
    text = ''
      repo="''${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
      exec sudo nixos-rebuild "''${1:-switch}" --flake "$repo#$(hostname)"
    '';
  };

  gulnux-home = writeShellApplication {
    name = "gulnux-home";
    text = ''
      repo="''${GULNUX_PERSONLIG:-$HOME/gulnux-personlig}"
      exec home-manager "''${1:-switch}" -b fore-gulnux --flake "$repo#$USER"
    '';
  };

  installera = skript "gulnux-installera" [ coreutils gawk git gh gul-setup util-linux ] "";

  alla = [
    gul
    gul-setup
    gul-minne
    gul-logg
    gul-larande
    gul-observera
    gul-reflektera
    gul-forslag
    gul-uppdatera
    gul-sok
    gul-session
    gulnux-rebuild
    gulnux-home
  ];
}
