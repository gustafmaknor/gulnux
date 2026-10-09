{ config, lib, pkgs, ... }:
let
  cfg = config.gulnux;

  python = pkgs.python3.withPackages (ps: [ ps.python-docx ps.openpyxl ps.python-pptx ]);

  gloffice = pkgs.writeShellApplication {
    name = "gloffice";
    runtimeInputs = lib.optional cfg.gloffice.libreoffice pkgs.libreoffice;
    text = ''
      export PYTHONPATH=${../../apps/gloffice}
      exec ${python}/bin/python -m gloffice "$@"
    '';
  };

  officeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ];

  gloffice-desktop = pkgs.makeDesktopItem {
    name = "gloffice";
    desktopName = "Gloffice";
    genericName = "Kontorssvit";
    exec = "gloffice %f";
    icon = "x-office-document";
    categories = [ "Office" ];
    mimeTypes = officeTypes;
  };
in
{
  options.gulnux.gloffice = {
    enable = lib.mkEnableOption "kontorssviten Gloffice" // { default = cfg.glome.enable; };
    libreoffice = lib.mkEnableOption "LibreOffice för PDF-export, äldre format och omräkning av formler" // { default = true; };
  };

  config = lib.mkIf cfg.gloffice.enable {
    environment.systemPackages = [ gloffice gloffice-desktop ];
    xdg.mime.defaultApplications = lib.genAttrs officeTypes (_: "gloffice.desktop");
  };
}
