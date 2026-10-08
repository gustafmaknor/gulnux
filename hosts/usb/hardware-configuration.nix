# Platshållare – ersätts av filen som `nixos-generate-config` skapar vid installationen.
# Den förutsätter partitioner med etiketterna "gulnux" och "GULBOOT" (se README).
{
  fileSystems."/" = {
    device = "/dev/disk/by-label/gulnux";
    fsType = "ext4";
  };
  fileSystems."/boot" = {
    device = "/dev/disk/by-label/GULBOOT";
    fsType = "vfat";
    options = [ "fmask=0077" "dmask=0077" ];
  };

  nixpkgs.hostPlatform = "x86_64-linux";
}
