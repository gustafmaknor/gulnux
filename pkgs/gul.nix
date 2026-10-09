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
  gul-agent-status = skript "gul-agent-status" [ coreutils jq libnotify tmux ] "";

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
      action="''${1:-switch}"
      sudo nixos-rebuild "$action" --flake "$repo#$(hostname)"
      # Greed och sökningen körs från /run/current-system och märker inte att programmet
      # bytts ut, så starta om dem (bara om de redan körs)
      if [ "$action" = switch ] || [ "$action" = test ]; then
        systemctl --user try-restart greed.service gulsearch.service || true
      fi
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
    gul-agent-status
    gul-session
    gulnux-rebuild
    gulnux-home
  ];
}
