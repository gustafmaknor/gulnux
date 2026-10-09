{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;
  gul = pkgs.callPackage ../../pkgs/gul.nix { };
in
{
  options.gulnux.agent.default = lib.mkOption {
    type = lib.types.enum [ "claude" "codex" "vibe" ];
    default = "claude";
    description = "Agenten som `gul` startar om användaren inte valt någon annan.";
  };

  config = {
    environment.systemPackages = gul.alla ++ [
      pkgs.claude-code
      pkgs.codex
      # Mistral Vibe startas via uv av `gul` tills den finns i nixpkgs
    ];

    environment.etc."gulnux/AGENTS.md".source = ../../agent/AGENTS.md;
    environment.etc."gulnux/default-agent".text = cfg.agent.default;
  };
}
