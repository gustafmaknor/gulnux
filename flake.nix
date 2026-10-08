{
  description = "Gulnux – en AI-first-distribution byggd på NixOS";

  inputs = {
    # unstable eftersom kodagenterna uppdateras ofta
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixos-hardware.url = "github:NixOS/nixos-hardware";
  };

  outputs = { self, nixpkgs, nixos-hardware, ... }: {
    nixosConfigurations = {
      # Lenovo ThinkPad X1 Carbon Gen 10
      x1 = nixpkgs.lib.nixosSystem {
        modules = [
          ./modules/gulnux
          nixos-hardware.nixosModules.lenovo-thinkpad-x1-10th-gen
          ./hosts/x1
        ];
      };

      # Testmaskin i VirtualBox
      vm = nixpkgs.lib.nixosSystem {
        modules = [
          ./modules/gulnux
          ./hosts/vm
        ];
      };

      # Live-/installations-ISO med agenterna förinstallerade
      iso = nixpkgs.lib.nixosSystem {
        modules = [
          ./modules/gulnux
          "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
          ./hosts/iso
        ];
      };
    };

    packages.x86_64-linux.iso = self.nixosConfigurations.iso.config.system.build.isoImage;
  };
}
