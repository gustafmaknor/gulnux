{ lib, pkgs, ... }:
{
  networking.hostName = "gulnux-live";
  networking.wireless.enable = lib.mkForce false; # NetworkManager används i stället

  # Live-miljön är bara terminal: partitionera och kör sedan `gulnux-install`
  gulnux.desktop.enable = false;
  environment.systemPackages = [ (pkgs.callPackage ../../pkgs/gul.nix { }).install ];

  nixpkgs.hostPlatform = "x86_64-linux";
}
