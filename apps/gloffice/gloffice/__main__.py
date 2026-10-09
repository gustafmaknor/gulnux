"""gloffice – Gulnux kontorssvit

  gloffice [fil]     öppna Gloffice i Glome (och filen, om den anges)
  gloffice serve     kör webbservern i förgrunden
  gloffice mcp       kör MCP-servern på stdin/stdout (används av agenterna)
"""

import sys

from . import core


def main():
    args = sys.argv[1:]
    command = args[0] if args else None
    if command == "serve":
        from . import web
        web.serve()
    elif command == "mcp":
        from . import mcp
        mcp.main()
    elif command in ("-h", "--help"):
        print(__doc__)
    else:
        from . import launcher
        try:
            print(launcher.open_ui(command))
        except core.GlofficeError as e:
            sys.exit(f"gloffice: {e}")


if __name__ == "__main__":
    main()
