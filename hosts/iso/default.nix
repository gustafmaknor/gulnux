{ lib, ... }:
{
  networking.hostName = "gulnux-live";
  networking.wireless.enable = lib.mkForce false; # NetworkManager används i stället

  # Live-miljön är bara terminal: logga in och kör `gul` för hjälp med installationen
  gulnux.desktop.enable = false;

  # Gulnux-källkoden följer med så att den kan installeras direkt från USB-stickan
  environment.etc."gulnux/src".source = ../..;

  nixpkgs.hostPlatform = "x86_64-linux";
}
