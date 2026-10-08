{
  imports = [ ./hardware-configuration.nix ];

  networking.hostName = "gulnux-usb";

  # Installeras som "flyttbar" EFI-boot: inga bootposter skrivs i datorns firmware,
  # så den inbyggda disken och dess bootmeny lämnas orörda. Starta via bootmenyn (F12 på ThinkPad).
  boot.loader.grub = {
    enable = true;
    efiSupport = true;
    efiInstallAsRemovable = true;
    device = "nodev";
  };
  boot.loader.efi.canTouchEfiVariables = false;

  # Ska kunna starta på olika datorer
  boot.initrd.availableKernelModules = [ "xhci_pci" "ehci_pci" "ahci" "nvme" "usb_storage" "uas" "sd_mod" "thunderbolt" ];
  hardware.enableRedistributableFirmware = true;
  hardware.cpu.intel.updateMicrocode = true;
  hardware.cpu.amd.updateMicrocode = true;

  # Spara på USB-minnets skrivcykler
  fileSystems."/".options = [ "noatime" ];

  system.stateVersion = "26.05";
}
