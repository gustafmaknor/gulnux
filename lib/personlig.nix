# Bygger en användares maskiner och hemkatalog ur hens personliga repo.
#
#   gulnux.lib.personlig {
#     installningar = import ./installningar.nix;
#     hem = ./home.nix;        # användarnivå (Home Manager)
#     maskiner = ./hosts;      # en katalog per maskin som användaren äger
#   }
{ self, inputs }:
{ installningar, hem ? null, maskiner ? null }:
let
  inherit (inputs.nixpkgs) lib;
  specialArgs = { gulnux = self; inherit inputs installningar; };

  # En maskin per katalog i hosts/. Ett repo utan maskiner (t.ex. en extra användare
  # på någon annans dator) har bara hemkonfigurationen.
  maskinnamn =
    if maskiner != null && builtins.pathExists maskiner
    then builtins.attrNames (lib.filterAttrs (_: typ: typ == "directory") (builtins.readDir maskiner))
    else [ ];
in
{
  nixosConfigurations = lib.genAttrs maskinnamn (maskin: lib.nixosSystem {
    inherit specialArgs;
    modules = [
      self.nixosModules.default
      (maskiner + "/${maskin}")
      {
        networking.hostName = lib.mkDefault maskin;
        gulnux.users.${installningar.anvandarnamn} = {
          namn = installningar.namn;
          admin = true;
        };
        gulnux.agent.default = lib.mkDefault (installningar.agent or "claude");
      }
    ];
  });

  homeConfigurations.${installningar.anvandarnamn} = inputs.home-manager.lib.homeManagerConfiguration {
    pkgs = import inputs.nixpkgs {
      system = "x86_64-linux";
      config.allowUnfree = true;
    };
    extraSpecialArgs = specialArgs;
    modules = [ self.homeModules.default ] ++ lib.optional (hem != null) hem;
  };
}
