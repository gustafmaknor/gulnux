# Lenovo ThinkPad X1 Carbon Gen 10
{ inputs, ... }:
{
  imports = [
    ./generic.nix
    inputs.nixos-hardware.nixosModules.lenovo-thinkpad-x1-10th-gen
  ];

  services.thermald.enable = true;
  services.power-profiles-daemon.enable = true;
  hardware.bluetooth.enable = true;
}
