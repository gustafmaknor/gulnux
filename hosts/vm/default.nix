{
  imports = [ ./hardware-configuration.nix ];

  networking.hostName = "gulnux-vm";

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  virtualisation.virtualbox.guest.enable = true;

  # VirtualBox grafikkort saknar riktig 3D – låt Sway rendera i mjukvara
  environment.sessionVariables = {
    WLR_RENDERER = "pixman";
    WLR_NO_HARDWARE_CURSORS = "1";
  };

  system.stateVersion = "26.05";
}
