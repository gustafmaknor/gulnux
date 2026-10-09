{
  description = "Gulnux – en AI-first-distribution byggd på NixOS";

  inputs = {
    # unstable eftersom kodagenterna uppdateras ofta
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixos-hardware.url = "github:NixOS/nixos-hardware";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, ... }@inputs:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      # Grunden som varje Gulnux-maskin bygger på
      nixosModules.default = ./modules/gulnux;

      # Maskinprofiler som en maskin i det personliga repot väljer bland
      nixosModules.profiles = {
        generic = ./modules/profiles/generic.nix;
        thinkpad-x1-gen10 = ./modules/profiles/thinkpad-x1-gen10.nix;
        virtualbox = ./modules/profiles/virtualbox.nix;
        usb = ./modules/profiles/usb.nix;
      };

      # Gulnux på användarnivå: git, minne, observation och reflektion
      homeModules.default = ./modules/home;

      # Bygger maskiner och hemkatalog ur ett personligt repo (se templates/personal)
      lib.personal = import ./lib/personal.nix { inherit self inputs; };

      templates.personal = {
        path = ./templates/personal;
        description = "Personligt Gulnux-repo med inställningar, maskiner och minne";
      };
      templates.default = self.templates.personal;

      # Live-/installations-ISO med agenterna och installationsprogrammet
      nixosConfigurations.iso = nixpkgs.lib.nixosSystem {
        specialArgs = { gulnux = self; inherit inputs; };
        modules = [
          self.nixosModules.default
          "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
          ./hosts/iso
        ];
      };

      packages.${system} = {
        iso = self.nixosConfigurations.iso.config.system.build.isoImage;
        install = (pkgs.callPackage ./pkgs/gul.nix { }).install;
      };

      # Utvecklingsmiljö för grunden: nix develop (se CLAUDE.md)
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          (pkgs.python3.withPackages (ps: [
            ps.python-docx
            ps.openpyxl
            ps.python-pptx
            ps.pypdf
            ps.sqlite-vec
            ps.feedparser
            ps.trafilatura
          ]))
          pkgs.nodejs
          pkgs.shellcheck
          pkgs.ruff
          pkgs.jq
          pkgs.chromium
        ];
      };

      # Från en vanlig NixOS-ISO:  nix run github:gustafmaknor/gulnux#install
      apps.${system}.install = {
        type = "app";
        program = "${self.packages.${system}.install}/bin/gulnux-install";
      };
    };
}
