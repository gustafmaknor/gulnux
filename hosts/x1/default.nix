{
  imports = [ ./hardware-configuration.nix ];

  networking.hostName = "x1";

  boot.loader.systemd-boot.enable = true;
  boot.loader.systemd-boot.configurationLimit = 20;
  boot.loader.efi.canTouchEfiVariables = true;

  services.fwupd.enable = true; # firmwareuppdateringar från Lenovo
  services.thermald.enable = true;
  services.power-profiles-daemon.enable = true;
  hardware.bluetooth.enable = true;

  # Sätts till den NixOS-version som installerades först och ändras sedan aldrig
  system.stateVersion = "26.05";
}
