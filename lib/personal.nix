# Bygger en användares maskiner och hemkatalog ur hens personliga repo.
#
#   gulnux.lib.personal {
#     settings = import ./settings.nix;
#     home = ./home.nix;        # användarnivå (Home Manager)
#     hosts = ./hosts;          # en katalog per maskin som användaren äger
#   }
{ self, inputs }:
{ settings, home ? null, hosts ? null }:
let
  inherit (inputs.nixpkgs) lib;
  specialArgs = { gulnux = self; inherit inputs settings; };

  # En maskin per katalog i hosts/. Ett repo utan maskiner (t.ex. en extra användare
  # på någon annans dator) har bara hemkonfigurationen.
  machines =
    if hosts != null && builtins.pathExists hosts
    then builtins.attrNames (lib.filterAttrs (_: type: type == "directory") (builtins.readDir hosts))
    else [ ];
in
{
  nixosConfigurations = lib.genAttrs machines (machine: lib.nixosSystem {
    inherit specialArgs;
    modules = [
      self.nixosModules.default
      (hosts + "/${machine}")
      {
        networking.hostName = lib.mkDefault machine;
        gulnux.users.${settings.username} = {
          name = settings.name;
          admin = true;
        };
        gulnux.agent.default = lib.mkDefault (settings.agent or "claude");
      }
    ];
  });

  homeConfigurations.${settings.username} = inputs.home-manager.lib.homeManagerConfiguration {
    pkgs = import inputs.nixpkgs {
      system = "x86_64-linux";
      config.allowUnfree = true;
    };
    extraSpecialArgs = specialArgs;
    modules = [ self.homeModules.default ] ++ lib.optional (home != null) home;
  };
}
