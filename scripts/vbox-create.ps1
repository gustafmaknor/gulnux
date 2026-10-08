# Skapar och startar en VirtualBox-VM för att testa Gulnux.
#   powershell -ExecutionPolicy Bypass -File scripts\vbox-create.ps1
param(
  [string]$Name = "gulnux",
  [int]$MemoryMB = 4096,
  [int]$Cpus = 2,
  [int]$DiskGB = 40
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # gör nedladdningen mycket snabbare i PowerShell 5

$vbox = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
function vb { & $vbox @args; if ($LASTEXITCODE) { throw "VBoxManage $args misslyckades" } }

$iso = Join-Path $env:USERPROFILE "Downloads\nixos-minimal.iso"
if (-not (Test-Path $iso)) {
  Write-Host "Laddar ner NixOS minimal ISO..."
  Invoke-WebRequest "https://channels.nixos.org/nixos-unstable/latest-nixos-minimal-x86_64-linux.iso" -OutFile $iso
}

$disk = Join-Path $env:USERPROFILE "VirtualBox VMs\$Name\$Name.vdi"

vb createvm --name $Name --ostype Linux_64 --register
vb modifyvm $Name --memory $MemoryMB --cpus $Cpus --firmware efi `
  --graphicscontroller vmsvga --vram 128 --nic1 nat --mouse usbtablet `
  --clipboard-mode bidirectional --boot1 disk --boot2 dvd
vb createmedium disk --filename $disk --size ($DiskGB * 1024)
vb storagectl $Name --name SATA --add sata --controller IntelAhci
vb storageattach $Name --storagectl SATA --port 0 --device 0 --type hdd --medium $disk
vb storageattach $Name --storagectl SATA --port 1 --device 0 --type dvddrive --medium $iso
vb startvm $Name
