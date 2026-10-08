{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;

  gul = pkgs.writeShellApplication {
    name = "gul";
    text = builtins.readFile ../../scripts/gul.sh;
  };

  # Agentsessionen lever i tmux så att den överlever att terminalen stängs
  gul-session = pkgs.writeShellApplication {
    name = "gul-session";
    runtimeInputs = [ pkgs.tmux ];
    text = ''exec tmux new-session -A -s gul "gul; exec bash -l"'';
  };

  gulnux-rebuild = pkgs.writeShellApplication {
    name = "gulnux-rebuild";
    text = ''
      flake="''${GULNUX_FLAKE:-$HOME/gulnux}"
      exec sudo nixos-rebuild "''${1:-switch}" --flake "$flake#$(hostname)"
    '';
  };
in
{
  options.gulnux.agent.default = lib.mkOption {
    type = lib.types.enum [ "claude" "codex" "vibe" ];
    default = "claude";
    description = "Agenten som `gul` startar om användaren inte valt någon annan.";
  };

  config = {
    environment.systemPackages = [
      gul
      gul-session
      gulnux-rebuild
      pkgs.claude-code
      pkgs.codex
      # Mistral Vibe startas via uv av `gul` tills den finns i nixpkgs
    ];

    environment.etc."gulnux/AGENTS.md".source = ../../agent/AGENTS.md;
    environment.etc."gulnux/default-agent".text = cfg.agent.default;
  };
}
