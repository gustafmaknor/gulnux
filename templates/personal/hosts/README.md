# Maskiner

En katalog per dator som du har installerat Gulnux på. Installationsprogrammet skapar den,
med `default.nix` (profil och systeminställningar) och `hardware-configuration.nix`.

Ändringar här gäller hela systemet och aktiveras med `gulnux-rebuild` (kräver sudo).
Använder du Gulnux på någon annans dator behövs ingen katalog här – dina personliga
inställningar ligger i `home.nix`.
