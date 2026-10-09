# Gulnux egna kommandon. Används av NixOS-modulen och av installationsprogrammet.
{ writeShellApplication, coreutils, git, gh, gnugrep, gnused, jq, libnotify, tmux, util-linux }:
let
  skript = name: runtimeInputs: forord: writeShellApplication {
    inherit name runtimeInputs;
    text = forord + builtins.readFile (../scripts + "/${name}.sh");
  };
in
rec {
  gul = skript "gul" [ coreutils gnugrep jq ] "";
  gul-setup = skript "gul-setup" [ coreutils git gh gnused ] ''
    export GULNUX_MALL=${../templates/personal}
  '';
  gul-memory = skript "gul-memory" [ gnugrep ] "";
  gul-log = skript "gul-log" [ coreutils jq ] "";
  gul-learning = skript "gul-learning" [ coreutils ] "";
  gul-observe = skript "gul-observe" [ jq ] "";
  gul-reflect = skript "gul-reflect" [ coreutils git gnugrep gnused libnotify gul-log ] ''
    export GULNUX_PROMPTER=${../agent/prompts}
  '';
  gul-proposals = skript "gul-proposals" [ coreutils git gnugrep gnused ] "";
  gul-update = skript "gul-update" [ git ] "";
  gul-search = skript "gul-search" [ ] "";

  # Agentsessionen lever i tmux så att den överlever att terminalen stängs
  gul-session = writeShellApplication {
    name = "gul-session";
    runtimeInputs = [ tmux ];
    text = ''exec tmux new-session -A -s gul "gul; exec bash -l"'';
  };

  gulnux-rebuild = writeShellApplication {
    name = "gulnux-rebuild";
    text = ''
      repo="''${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
      exec sudo nixos-rebuild "''${1:-switch}" --flake "$repo#$(hostname)"
    '';
  };

  gulnux-home = writeShellApplication {
    name = "gulnux-home";
    text = ''
      repo="''${GULNUX_PERSONAL:-$HOME/gulnux-personal}"
      exec home-manager "''${1:-switch}" -b before-gulnux --flake "$repo#$USER"
    '';
  };

  install = skript "gulnux-install" [ coreutils git gh gul-setup util-linux ] "";

  all = [
    gul
    gul-setup
    gul-memory
    gul-log
    gul-learning
    gul-observe
    gul-reflect
    gul-proposals
    gul-update
    gul-search
    gul-session
    gulnux-rebuild
    gulnux-home
  ];
}
