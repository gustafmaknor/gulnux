{
  description = "Mina personliga Gulnux-inställningar";

  # Gulnux-grunden. Versionen är låst i flake.lock – `gul update` hämtar senaste.
  inputs.gulnux.url = "github:gustafmaknor/gulnux";

  outputs = { gulnux, ... }:
    gulnux.lib.personlig {
      installningar = import ./installningar.nix;
      hem = ./home.nix;
      maskiner = ./hosts;
    };
}
